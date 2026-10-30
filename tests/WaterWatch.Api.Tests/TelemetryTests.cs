using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using WaterWatch.Api.Contracts;
using WaterWatch.Api.Data;
using WaterWatch.Api.Models;
using WaterWatch.Api.Services;

namespace WaterWatch.Api.Tests;

public sealed class TelemetryTests
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() } };
    private static Task<HttpResponseMessage> Post<T>(HttpClient client, string path, T body) => client.PostAsJsonAsync(path, body, Json);
    internal static RegisterSensorRequest Registration(string key = "test-moisture") => new() {
        SensorKey = key, Name = "Synthetic moisture test", Location = "Test bench", MeasurementType = "soil-moisture-raw",
        Source = TelemetrySource.Synthetic, Baseline = 600, Threshold = 300, MinimumDeviation = 150,
        Direction = ThresholdDirection.Below, RequiredConsecutive = 3, StaleAfterSeconds = 120 };
    internal static TelemetryRequest Reading(string key, double value = 200, int seconds = 0) => new() {
        SensorKey = key, MeasurementId = Guid.NewGuid(), MeasurementType = "soil-moisture-raw", Value = value, Unit = "adc",
        Timestamp = DateTimeOffset.UtcNow.AddMinutes(-30).AddSeconds(seconds), Source = TelemetrySource.Synthetic };
    private static void Ingestion(HttpClient client) => client.DefaultRequestHeaders.Authorization = new("Bearer", ApiFactory.SensorKey);
    private static async Task<Guid> Register(HttpClient client) {
        var response = await Post(client, "/api/sensors", Registration());
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }

    [Theory]
    [InlineData("")][InlineData("short")][InlineData("same-as-staff")]
    public async Task InvalidServerCredential_FailsClosed(string configured)
    {
        using var factory = new ApiFactory(sensorCredential: configured == "same-as-staff" ? ApiFactory.OperatorKey : configured);
        using var client = factory.CreateClient(); Ingestion(client);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Post(client, "/api/telemetry", Reading("test-moisture"))).StatusCode);
    }

    [Fact]
    public async Task FailedReadingInsert_RollsBackSensorAndAnomalyTogether()
    {
        using var factory = new ApiFactory(); using var client = factory.CreateClient(); var id = await Register(client); Ingestion(client);
        var time = DateTimeOffset.UtcNow.AddMinutes(-5);
        for (var i = 0; i < 2; i++) { var r = Reading("test-moisture"); r.Timestamp = time.AddSeconds(i * 5); await Post(client, "/api/telemetry", r); }
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WaterWatchDbContext>();
        var before = await db.Sensors.AsNoTracking().SingleAsync(x => x.Id == id);
        await db.Database.ExecuteSqlRawAsync("CREATE TRIGGER reject_reading BEFORE INSERT ON TelemetryReadings BEGIN SELECT RAISE(ABORT, 'test write failure'); END;");
        var third = Reading("test-moisture"); third.Timestamp = time.AddSeconds(10);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await Post(client, "/api/telemetry", third)).StatusCode);
        var after = await db.Sensors.AsNoTracking().SingleAsync(x => x.Id == id);
        Assert.Equal(before.Version, after.Version); Assert.Equal(before.LastMeasuredAtUtc, after.LastMeasuredAtUtc);
        Assert.Equal(2, await db.TelemetryReadings.CountAsync()); Assert.Empty(await db.SensorAnomalies.ToListAsync());
    }

    [Fact]
    public async Task Credentials_AreSeparated_AndAnonymousAccessIsRejected()
    {
        using var factory = new ApiFactory(); using var client = factory.CreateClient();
        await Register(client);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Post(client, "/api/telemetry", Reading("test-moisture"))).StatusCode);
        client.DefaultRequestHeaders.Authorization = null;
        foreach (var path in new[] { "/api/sensors", $"/api/sensors/{Guid.NewGuid()}/readings" })
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Post(client, "/api/telemetry", Reading("test-moisture"))).StatusCode);
        client.DefaultRequestHeaders.Authorization = new("Bearer", new string('x', 64));
        Assert.Equal(HttpStatusCode.Unauthorized, (await Post(client, "/api/telemetry", Reading("test-moisture"))).StatusCode);
        Ingestion(client);
        Assert.Equal(HttpStatusCode.Created, (await Post(client, "/api/telemetry", Reading("test-moisture"))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/sensors")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/incidents")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Post(client, "/api/sensors", Registration("other"))).StatusCode);
    }

    [Theory]
    [InlineData("value-low")][InlineData("value-high")][InlineData("unit")][InlineData("source")]
    [InlineData("type")][InlineData("old")][InlineData("future")][InlineData("identity")]
    public async Task InvalidMeasurements_DoNotPersist(string fault)
    {
        using var factory = new ApiFactory(); using var client = factory.CreateClient(); await Register(client); Ingestion(client);
        var reading = Reading("test-moisture");
        switch (fault) {
            case "value-low": reading.Value = -1; break;
            case "value-high": reading.Value = 1024; break;
            case "unit": reading.Unit = "%"; break;
            case "source": reading.Source = TelemetrySource.Physical; break;
            case "type": reading.MeasurementType = "temperature"; break;
            case "old": reading.Timestamp = DateTimeOffset.UtcNow.AddDays(-2); break;
            case "future": reading.Timestamp = DateTimeOffset.UtcNow.AddMinutes(5); break;
            case "identity": reading.MeasurementId = Guid.Empty; break;
        }
        Assert.Equal(HttpStatusCode.BadRequest, (await Post(client, "/api/telemetry", reading)).StatusCode);
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WaterWatchDbContext>();
        Assert.Empty(await db.TelemetryReadings.ToListAsync()); Assert.Empty(await db.SensorAnomalies.ToListAsync());
    }

    [Theory]
    [InlineData("{}")][InlineData("{invalid")][InlineData("{\"value\":\"NaN\"}")]
    [InlineData("{\"sensorKey\":\"test-moisture\",\"source\":123}")]
    public async Task MalformedOrMissingFields_Return400(string json)
    {
        using var factory = new ApiFactory(); using var client = factory.CreateClient(); Ingestion(client);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync("/api/telemetry", new StringContent(json, System.Text.Encoding.UTF8, "application/json"))).StatusCode);
    }

    [Fact]
    public async Task ConsecutiveRule_Deduplicates_Recovers_AndKeepsAnomaliesSeparate()
    {
        using var factory = new ApiFactory(); using var client = factory.CreateClient(); var id = await Register(client); Ingestion(client);
        var timestamp = DateTimeOffset.UtcNow.AddMinutes(-10);
        TelemetryRequest At(int step, double value = 200) { var r = Reading("test-moisture", value); r.Timestamp = timestamp.AddSeconds(step * 5); return r; }
        var first = At(0);
        Assert.Equal(HttpStatusCode.Created, (await Post(client, "/api/telemetry", first)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Post(client, "/api/telemetry", first)).StatusCode);
        first.Value = 201;
        Assert.Equal(HttpStatusCode.Conflict, (await Post(client, "/api/telemetry", first)).StatusCode);
        foreach (var index in new[] { 1, 2, 3, 4 })
            Assert.Equal(HttpStatusCode.Created, (await Post(client, "/api/telemetry", At(index))).StatusCode);
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<WaterWatchDbContext>();
            Assert.Equal(5, await db.TelemetryReadings.CountAsync()); Assert.Single(await db.SensorAnomalies.ToListAsync());
            Assert.Empty(await db.Incidents.ToListAsync());
        }
        Assert.Equal(HttpStatusCode.Conflict, (await Post(client, "/api/telemetry", At(3))).StatusCode);
        await Post(client, "/api/telemetry", At(5, 600));
        foreach (var index in new[] { 6, 7, 8 }) await Post(client, "/api/telemetry", At(index));
        client.DefaultRequestHeaders.Authorization = new("Bearer", ApiFactory.OperatorKey);
        var summaries = await client.GetFromJsonAsync<SensorSummary[]>("/api/sensors", Json);
        Assert.NotNull(Assert.Single(summaries!).ActiveAnomaly);
        var history = await client.GetFromJsonAsync<TelemetryReading[]>($"/api/sensors/{id}/readings?limit=2", Json);
        Assert.Equal(2, history!.Length); Assert.True(history[0].MeasuredAtUtc > history[1].MeasuredAtUtc);
        using var finalScope = factory.Services.CreateScope(); var finalDb = finalScope.ServiceProvider.GetRequiredService<WaterWatchDbContext>();
        Assert.Equal(2, await finalDb.SensorAnomalies.CountAsync());
        Assert.Single(await finalDb.SensorAnomalies.Where(x => x.RecoveredAtUtc == null).ToListAsync());
    }

    [Fact]
    public async Task NormalReadingAndStaleGap_ResetConsecutiveCount()
    {
        using var factory = new ApiFactory(); using var client = factory.CreateClient(); await Register(client); Ingestion(client);
        var start = DateTimeOffset.UtcNow.AddMinutes(-10);
        foreach (var (offset, value) in new[] { (0, 200), (5, 200), (10, 600), (15, 200), (200, 200), (205, 200) }) {
            var r = Reading("test-moisture", value); r.Timestamp = start.AddSeconds(offset);
            Assert.Equal(HttpStatusCode.Created, (await Post(client, "/api/telemetry", r)).StatusCode);
        }
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WaterWatchDbContext>();
        Assert.Empty(await db.SensorAnomalies.ToListAsync());
        Assert.Equal(2, (await db.Sensors.SingleAsync()).ConsecutiveAbnormal);
    }

    [Theory]
    [InlineData(ThresholdDirection.Above, 70, 30, 70, 20, true)]
    [InlineData(ThresholdDirection.Above, 70, 60, 70, 20, false)]
    [InlineData(ThresholdDirection.Above, 69, 30, 70, 20, false)]
    [InlineData(ThresholdDirection.Below, 300, 600, 300, 150, true)]
    [InlineData(ThresholdDirection.Below, 300, 350, 300, 150, false)]
    public void Rule_RequiresThresholdAndBaselineDeviation(ThresholdDirection direction, double value, double baseline, double threshold, double deviation, bool expected) =>
        Assert.Equal(expected, TelemetryService.IsAbnormal(new Sensor { Direction = direction, Baseline = baseline, Threshold = threshold, MinimumDeviation = deviation }, value));

    [Fact]
    public async Task RegistrationAndPagination_AreValidated()
    {
        using var factory = new ApiFactory(); using var client = factory.CreateClient();
        var invalid = Registration(); invalid.Threshold = 700;
        Assert.Equal(HttpStatusCode.BadRequest, (await Post(client, "/api/sensors", invalid)).StatusCode);
        invalid = Registration(); invalid.RequiredConsecutive = 1;
        Assert.Equal(HttpStatusCode.BadRequest, (await Post(client, "/api/sensors", invalid)).StatusCode);
        var id = await Register(client);
        Assert.Equal(HttpStatusCode.Conflict, (await Post(client, "/api/sensors", Registration())).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/sensors?pageSize=101")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync($"/api/sensors/{id}/readings?limit=201")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/sensors/{Guid.NewGuid()}/readings")).StatusCode);
        Ingestion(client);
        Assert.Equal(HttpStatusCode.NotFound, (await Post(client, "/api/telemetry", Reading("unknown"))).StatusCode);
    }

    [PostgresFact]
    public async Task Postgres_TelemetryPersistsAcrossScopes_AndRetryCannotDuplicateAnomaly()
    {
        await using var connection = new NpgsqlConnection(Environment.GetEnvironmentVariable("WATERWATCH_TEST_POSTGRES"));
        await connection.OpenAsync(); await using var transaction = await connection.BeginTransactionAsync();
        using var factory = new ApiFactory(true, connection.ConnectionString, connection, transaction); using var client = factory.CreateClient();
        var key = "test-" + Guid.NewGuid().ToString("N");
        var registered = await Post(client, "/api/sensors", Registration(key)); Assert.Equal(HttpStatusCode.Created, registered.StatusCode);
        var id = (await registered.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Ingestion(client); var time = DateTimeOffset.UtcNow.AddMinutes(-2);
        for (var i = 0; i < 5; i++) {
            var reading = Reading(key); reading.Timestamp = time.AddSeconds(i * 5);
            Assert.Equal(HttpStatusCode.Created, (await Post(client, "/api/telemetry", reading)).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await Post(client, "/api/telemetry", reading)).StatusCode);
        }
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<WaterWatchDbContext>();
            Assert.Equal(5, await db.TelemetryReadings.CountAsync(x => x.SensorId == id));
            Assert.Single(await db.SensorAnomalies.Where(x => x.SensorId == id).ToListAsync());
        }
        client.DefaultRequestHeaders.Authorization = new("Bearer", ApiFactory.OperatorKey);
        Assert.Equal(5, (await client.GetFromJsonAsync<TelemetryReading[]>($"/api/sensors/{id}/readings", Json))!.Length);
        // RLS and direct REST grants must not expose operational sensor records.
        await using var access = new NpgsqlCommand("SELECT relrowsecurity FROM pg_class WHERE oid='\"Sensors\"'::regclass", connection, transaction);
        Assert.Equal(true, await access.ExecuteScalarAsync());
        await transaction.RollbackAsync();
    }
}
