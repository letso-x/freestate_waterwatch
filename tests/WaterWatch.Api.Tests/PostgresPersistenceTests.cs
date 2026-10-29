using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using WaterWatch.Api.Data;

namespace WaterWatch.Api.Tests;

public sealed class PostgresFactAttribute : FactAttribute
{
    public PostgresFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("WATERWATCH_TEST_POSTGRES")))
            Skip = "Set WATERWATCH_TEST_POSTGRES to a migrated PostgreSQL database to run the live persistence test.";
    }
}

public sealed class PostgresPersistenceTests
{
    [PostgresFact]
    public async Task Postgres_CreateThenGet_CommitsRow()
    {
        await using var connection = new NpgsqlConnection(Environment.GetEnvironmentVariable("WATERWATCH_TEST_POSTGRES"));
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();
        using var factory = new ApiFactory(true, connection.ConnectionString, connection, transaction);
        using var client = factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/incidents", new {
            title = "WaterWatch integration test", description = "Temporary report created by the PostgreSQL persistence test.",
            location = "Bloemfontein test location", latitude = -29.12, longitude = 26.21 });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = await response.Content.ReadFromJsonAsync<JsonElement>();
        var id = created.GetProperty("id").GetGuid();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<WaterWatchDbContext>();
            Assert.Equal("Npgsql.EntityFrameworkCore.PostgreSQL", db.Database.ProviderName);
            Assert.True(await db.Incidents.AsNoTracking().AnyAsync(x => x.Id == id));
        }
        var list = await client.GetFromJsonAsync<JsonElement[]>("/api/incidents?pageSize=100");
        Assert.Contains(list!, x => x.GetProperty("id").GetGuid() == id);
        foreach (var status in new[] { "UnderReview", "InProgress", "Resolved", "UnderReview" })
        {
            var change = await client.PatchAsJsonAsync($"/api/incidents/{id}/status", new { status, note = "Operator recorded a repair outcome for integration verification." });
            Assert.Equal(HttpStatusCode.OK, change.StatusCode);
        }
        Assert.Equal(HttpStatusCode.OK, (await client.PatchAsJsonAsync($"/api/incidents/{id}/priority", new { priority = "High", note = "Private severity assessment." })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PatchAsJsonAsync($"/api/incidents/{id}/assignment", new { assignedTo = "Private team", note = "Private assignment." })).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync($"/api/incidents/{id}/notes", new { note = "Private investigation evidence." })).StatusCode);
        var trackingText = await client.GetStringAsync($"/api/public/incidents/{id}/tracking");
        Assert.DoesNotContain("Private", trackingText);
        Assert.DoesNotContain("test-operator", trackingText);
        using var tracking = JsonDocument.Parse(trackingText);
        Assert.Equal("UnderReview", tracking.RootElement.GetProperty("status").GetString());
        Assert.Equal(5, tracking.RootElement.GetProperty("events").GetArrayLength());
        // Real PostgreSQL trigger verification, contained in a savepoint.
        await transaction.SaveAsync("immutability");
        await using var command = new NpgsqlCommand("UPDATE \"IncidentEvents\" SET \"Note\"='tamper' WHERE \"IncidentId\"=@id", connection, transaction);
        command.Parameters.AddWithValue("id", id);
        await Assert.ThrowsAsync<PostgresException>(async () => { await command.ExecuteNonQueryAsync(); });
        await transaction.RollbackAsync("immutability");
        await transaction.RollbackAsync(); // No committed test incidents or history are deleted.
    }
}
