using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WaterWatch.Api.Data;
using WaterWatch.Api.Models;

namespace WaterWatch.Api.Tests;

public sealed class IncidentWorkflowTests
{
    private static async Task<Guid> Create(HttpClient client)
    {
        var response = await client.PostAsJsonAsync("/api/incidents", new { title = "Burst pipe workflow test", description = "A pipe is leaking outside the library.", location = "Private address, Bloemfontein", latitude = -29.12, longitude = 26.21 });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }
    private static Task<HttpResponseMessage> Status(HttpClient client, Guid id, string status, string? note = null) =>
        client.PatchAsJsonAsync($"/api/incidents/{id}/status", new { status, note });

    [Fact]
    public async Task Lifecycle_ResolvesAndReopens_WithAppendOnlyHistory()
    {
        using var factory = new ApiFactory(); using var client = factory.CreateClient();
        var id = await Create(client);
        DateTime previous = default;
        foreach (var status in new[] { "UnderReview", "InProgress", "Resolved", "UnderReview" })
        {
            var response = await Status(client, id, status, "Repaired the damaged section and checked flow.");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var record = await response.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal(status, record.GetProperty("status").GetString());
            var updated = record.GetProperty("updatedAtUtc").GetDateTime();
            Assert.True(updated > previous); previous = updated;
            Assert.Equal(status == "Resolved", record.GetProperty("resolvedAtUtc").ValueKind != JsonValueKind.Null);
        }
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WaterWatchDbContext>();
        var events = await db.IncidentEvents.AsNoTracking().Where(x => x.IncidentId == id).OrderBy(x => x.CreatedAtUtc).ToListAsync();
        Assert.Equal(5, events.Count);
        Assert.Equal(IncidentStatus.Resolved, events[^1].OldStatus);
        Assert.Equal(IncidentStatus.UnderReview, events[^1].NewStatus);
        Assert.Equal("test-operator", events[^1].ActorIdentifier);
    }

    [Theory]
    [InlineData("Reported")]
    [InlineData("InProgress")]
    [InlineData("Resolved")]
    [InlineData("NotAStatus")]
    public async Task InvalidTransitionsOrValues_AreRejectedWithoutEvents(string target)
    {
        using var factory = new ApiFactory(); using var client = factory.CreateClient();
        var id = await Create(client);
        Assert.Equal(HttpStatusCode.BadRequest, (await Status(client, id, target)).StatusCode);
        var history = await client.GetFromJsonAsync<JsonElement[]>($"/api/incidents/{id}/events");
        Assert.Single(history!);
    }
    [Theory]
    [InlineData(null)] [InlineData("")] [InlineData("          ")] [InlineData("fixed")]
    public async Task Resolution_RequiresMeaningfulActionNote(string? note)
    {
        using var factory = new ApiFactory(); using var client = factory.CreateClient();
        var id = await Create(client);
        Assert.Equal(HttpStatusCode.OK, (await Status(client, id, "UnderReview")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Status(client, id, "InProgress")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Status(client, id, "Resolved", note)).StatusCode);
        var record = await client.GetFromJsonAsync<JsonElement>($"/api/incidents/{id}");
        Assert.Equal("InProgress", record.GetProperty("status").GetString());
        Assert.Equal(JsonValueKind.Null, record.GetProperty("resolvedAtUtc").ValueKind);
    }
    [Fact]
    public async Task PriorityAssignmentAndNotes_PersistPrivately_WithoutChangingStatus()
    {
        using var factory = new ApiFactory(); using var client = factory.CreateClient();
        var id = await Create(client);
        Assert.Equal(HttpStatusCode.OK, (await client.PatchAsJsonAsync($"/api/incidents/{id}/priority", new { priority = "Critical", note = "Internal priority evidence." })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PatchAsJsonAsync($"/api/incidents/{id}/assignment", new { assignedTo = " Maintenance A ", note = "Internal assignment evidence." })).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync($"/api/incidents/{id}/notes", new { note = "Internal investigation evidence.", isPublic = true, actorIdentifier = "forged" })).StatusCode);
        var record = await client.GetFromJsonAsync<JsonElement>($"/api/incidents/{id}");
        Assert.Equal("Reported", record.GetProperty("status").GetString());
        Assert.Equal("Critical", record.GetProperty("priority").GetString());
        Assert.Equal("Maintenance A", record.GetProperty("assignedTo").GetString());
        var events = await client.GetFromJsonAsync<JsonElement[]>($"/api/incidents/{id}/events");
        Assert.Equal(4, events!.Length);
        Assert.All(events.Skip(1), item => { Assert.False(item.GetProperty("isPublic").GetBoolean()); Assert.Equal("test-operator", item.GetProperty("actorIdentifier").GetString()); });
        Assert.Equal(HttpStatusCode.OK, (await client.PatchAsJsonAsync($"/api/incidents/{id}/assignment", new { assignedTo = (string?)null })).StatusCode);
        var unassigned = await client.GetFromJsonAsync<JsonElement>($"/api/incidents/{id}");
        Assert.Equal(JsonValueKind.Null, unassigned.GetProperty("assignedTo").ValueKind);
    }
    [Fact]
    public async Task PublicTracking_UsesServerSideAllowlist_AndNeverIncludesOperatorNotes()
    {
        using var factory = new ApiFactory(); using var client = factory.CreateClient();
        var id = await Create(client);
        await Status(client, id, "UnderReview", "Private staff medical detail should never be public.");
        await client.PostAsJsonAsync($"/api/incidents/{id}/notes", new { note = "Secret investigation." });
        client.DefaultRequestHeaders.Authorization = null;
        var response = await client.GetAsync($"/api/public/incidents/{id}/tracking");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.Content.ReadAsStringAsync();
        foreach (var privateText in new[] { "Private address", "Private staff", "Secret investigation", "test-operator" })
            Assert.DoesNotContain(privateText, json, StringComparison.OrdinalIgnoreCase);
        var record = JsonDocument.Parse(json).RootElement;
        foreach (var field in new[] { "actorIdentifier", "assignedTo", "priority", "latitude", "longitude", "description", "note" })
            Assert.False(record.TryGetProperty(field, out _));
        foreach (var item in record.GetProperty("events").EnumerateArray())
        { Assert.False(item.TryGetProperty("note", out _)); Assert.False(item.TryGetProperty("actorIdentifier", out _)); }
        Assert.Equal("UnderReview", record.GetProperty("status").GetString());
        Assert.Equal(2, record.GetProperty("events").GetArrayLength());
    }
    [Theory]
    [InlineData("GET", "")]
    [InlineData("GET", "/events")]
    [InlineData("PATCH", "/status")]
    [InlineData("PATCH", "/priority")]
    [InlineData("PATCH", "/assignment")]
    [InlineData("POST", "/notes")]
    public async Task UnauthorizedPrivilegedRequests_AreRejected(string method, string suffix)
    {
        using var factory = new ApiFactory(); using var client = factory.CreateClient();
        var id = await Create(client);
        client.DefaultRequestHeaders.Authorization = null;
        using var request = new HttpRequestMessage(new HttpMethod(method), $"/api/incidents/{id}{suffix}");
        request.Content = JsonContent.Create(new { status = "UnderReview", priority = "High", assignedTo = "Team", note = "Should not be saved." });
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.SendAsync(request)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/incidents")).StatusCode);
    }
    [Fact]
    public async Task InvalidToken_IsRejected_ButPublicReportingRemainsAvailable()
    {
        using var factory = new ApiFactory(); using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32)));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/incidents")).StatusCode);
        await Create(client);
    }
    [Theory]
    [InlineData("priority", "{\"priority\":\"Unknown\"}")]
    [InlineData("priority", "{\"priority\":123}")]
    [InlineData("status", "{\"status\":123}")]
    [InlineData("status", "{}")]
    public async Task InvalidPayloads_AreValidated(string endpoint, string body)
    {
        using var factory = new ApiFactory(); using var client = factory.CreateClient();
        var id = await Create(client);
        var response = await client.PatchAsync($"/api/incidents/{id}/{endpoint}", new StringContent(body, System.Text.Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
    [Fact]
    public async Task MissingIncident_Returns404()
    {
        using var factory = new ApiFactory(); using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound, (await Status(client, Guid.NewGuid(), "UnderReview")).StatusCode);
    }
    [Fact]
    public async Task FailedEventInsert_RollsBackStatusAndTimestamp()
    {
        using var factory = new ApiFactory(); using var client = factory.CreateClient();
        var id = await Create(client);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WaterWatchDbContext>();
        var before = await db.Incidents.AsNoTracking().SingleAsync(x => x.Id == id);
        await db.Database.ExecuteSqlRawAsync("CREATE TRIGGER reject_status_event BEFORE INSERT ON IncidentEvents WHEN NEW.EventType = 'StatusChanged' BEGIN SELECT RAISE(ABORT, 'simulated audit failure'); END;");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await Status(client, id, "UnderReview")).StatusCode);
        var after = await db.Incidents.AsNoTracking().SingleAsync(x => x.Id == id);
        Assert.Equal(before.Status, after.Status);
        Assert.Equal(before.UpdatedAtUtc, after.UpdatedAtUtc);
        Assert.Single(await db.IncidentEvents.Where(x => x.IncidentId == id).ToListAsync());
    }
    [Fact]
    public async Task TrackedHistory_CannotBeModifiedOrDeleted()
    {
        using var factory = new ApiFactory(); using var client = factory.CreateClient();
        var id = await Create(client);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WaterWatchDbContext>();
        var entry = await db.IncidentEvents.SingleAsync(x => x.IncidentId == id);
        entry.Note = "tamper";
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        db.IncidentEvents.Remove(entry);
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }
    [Fact]
    public async Task ConcurrentStaleUpdate_IsRejectedAndItsEventIsRolledBack()
    {
        using var factory = new ApiFactory(); using var client = factory.CreateClient();
        var id = await Create(client);
        using var scope1 = factory.Services.CreateScope(); using var scope2 = factory.Services.CreateScope();
        var first = scope1.ServiceProvider.GetRequiredService<WaterWatchDbContext>();
        var second = scope2.ServiceProvider.GetRequiredService<WaterWatchDbContext>();
        var stale = await first.Incidents.SingleAsync(x => x.Id == id);
        var current = await second.Incidents.SingleAsync(x => x.Id == id);
        current.Priority = IncidentPriority.High; current.UpdatedAtUtc = current.UpdatedAtUtc.AddSeconds(1);
        await second.SaveChangesAsync();
        stale.Status = IncidentStatus.UnderReview; stale.UpdatedAtUtc = stale.UpdatedAtUtc.AddSeconds(2);
        first.IncidentEvents.Add(new IncidentEvent { IncidentId = id, EventType = IncidentEventType.StatusChanged, ActorIdentifier = "test" });
        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => first.SaveChangesAsync());
        Assert.Equal(1, await second.IncidentEvents.CountAsync(x => x.IncidentId == id));
    }
}
