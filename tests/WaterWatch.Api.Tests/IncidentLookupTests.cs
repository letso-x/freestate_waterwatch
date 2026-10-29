using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace WaterWatch.Api.Tests;

public sealed class IncidentLookupTests
{
    [Fact]
    public async Task Lookup_ReturnsStoredReportAndCoordinates()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/incidents", new
        {
            title = "Damaged water pipe", description = "Water flowing outside the community library.",
            location = "Bloemfontein library", latitude = -29.12, longitude = 26.21
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = await response.Content.ReadFromJsonAsync<JsonElement>();
        var id = created.GetProperty("id").GetGuid();
        using var request = new HttpRequestMessage(HttpMethod.Get, $"/api/incidents/{id}");
        request.Headers.Add("Origin", "http://localhost:5173");
        var found = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, found.StatusCode);
        var record = await found.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(id, record.GetProperty("id").GetGuid());
        Assert.Equal(-29.12, record.GetProperty("latitude").GetDouble());
        Assert.Equal(26.21, record.GetProperty("longitude").GetDouble());
        Assert.Equal("Reported", record.GetProperty("status").GetString());
        Assert.Equal("http://localhost:5173", Assert.Single(found.Headers.GetValues("Access-Control-Allow-Origin")));
    }

    [Fact]
    public async Task UnknownReference_Returns404()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/incidents/{Guid.NewGuid()}")).StatusCode);
    }
}
