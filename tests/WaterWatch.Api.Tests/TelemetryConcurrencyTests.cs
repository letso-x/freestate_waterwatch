using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using WaterWatch.Api.Contracts;
using WaterWatch.Api.Data;

namespace WaterWatch.Api.Tests;

public sealed class TelemetryConcurrencyTests
{
    [PostgresFact]
    public async Task ConcurrentRetries_CommitOneReadingAndAnomaly_VisibleToFreshApplication()
    {
        var connection = Environment.GetEnvironmentVariable("WATERWATCH_TEST_POSTGRES")!;
        var key = "test-concurrent-" + Guid.NewGuid().ToString("N");
        var json = new JsonSerializerOptions(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };
        Guid id = Guid.Empty; Guid anomalyId = Guid.Empty;
        try
        {
            using (var factory = new ApiFactory(true, connection))
            using (var client = factory.CreateClient())
            {
                var registered = await client.PostAsJsonAsync("/api/sensors", TelemetryTests.Registration(key), json);
                Assert.Equal(HttpStatusCode.Created, registered.StatusCode);
                id = (await registered.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
                client.DefaultRequestHeaders.Authorization = new("Bearer", ApiFactory.SensorKey);
                var start = DateTimeOffset.UtcNow.AddMinutes(-1);
                for (var step = 0; step < 2; step++)
                {
                    var reading = TelemetryTests.Reading(key); reading.Timestamp = start.AddSeconds(step * 5);
                    Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/telemetry", reading, json)).StatusCode);
                }
                var third = TelemetryTests.Reading(key); third.Timestamp = start.AddSeconds(10);
                var responses = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => client.PostAsJsonAsync("/api/telemetry", third, json)));
                Assert.Single(responses, x => x.StatusCode == HttpStatusCode.Created);
                Assert.Equal(3, responses.Count(x => x.StatusCode == HttpStatusCode.OK));
                foreach (var response in responses) response.Dispose();
                client.DefaultRequestHeaders.Authorization = new("Bearer", ApiFactory.OperatorKey);
                var sensors = await client.GetFromJsonAsync<SensorSummary[]>("/api/sensors?pageSize=100", json);
                anomalyId = sensors!.Single(x => x.Id == id).ActiveAnomaly!.Id;
            }
            // New host, new pool connections and new EF scopes must see committed state.
            using var restarted = new ApiFactory(true, connection);
            using var freshClient = restarted.CreateClient();
            var history = await freshClient.GetFromJsonAsync<JsonElement[]>($"/api/sensors/{id}/readings");
            Assert.Equal(3, history!.Length);
            var restored = await freshClient.GetFromJsonAsync<SensorSummary[]>("/api/sensors?pageSize=100", json);
            Assert.Equal(anomalyId, restored!.Single(x => x.Id == id).ActiveAnomaly!.Id);
        }
        finally
        {
            // Only this uniquely named synthetic test sensor is removed. Incident history is never touched.
            await using var db = new WaterWatchDbContext(new DbContextOptionsBuilder<WaterWatchDbContext>().UseNpgsql(connection).Options);
            var sensor = await db.Sensors.AsNoTracking().SingleOrDefaultAsync(x => x.SensorKey == key);
            if (sensor is not null)
            {
                await using var cleanup = await db.Database.BeginTransactionAsync();
                await db.SensorAnomalies.Where(x => x.SensorId == sensor.Id).ExecuteDeleteAsync();
                await db.TelemetryReadings.Where(x => x.SensorId == sensor.Id).ExecuteDeleteAsync();
                await db.Sensors.Where(x => x.Id == sensor.Id && x.SensorKey == key).ExecuteDeleteAsync();
                await cleanup.CommitAsync();
            }
        }
    }
}
