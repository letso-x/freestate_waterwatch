using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WaterWatch.Api.Contracts;
using WaterWatch.Api.Data;

namespace WaterWatch.Api.Tests;
public sealed class SensorCalibrationTests
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };
    private static async Task<Guid> Register(HttpClient client) {
        var result = await client.PostAsJsonAsync("/api/sensors", TelemetryTests.Registration(), Json);
        Assert.Equal(HttpStatusCode.Created, result.StatusCode);
        return (await result.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }
    private static async Task<SensorCalibrationRequest> Calibration(HttpClient client, Guid id) {
        var sensor = await client.GetFromJsonAsync<JsonElement>($"/api/sensors/{id}");
        return new() { SensorKey = "test-moisture", ExpectedVersion = sensor.GetProperty("version").GetGuid(), Baseline = 561, Threshold = 350, MinimumDeviation = 150, Direction = WaterWatch.Api.Models.ThresholdDirection.Below, RequiredConsecutive = 2 };
    }
    [Fact]
    public async Task UpdatingExistingSensor_PreservesHistory_TriggersOnceAfterTwoNewReadings_ThenRecovers()
    {
        using var factory = new ApiFactory(); using var client = factory.CreateClient(); var id = await Register(client);
        var start = DateTimeOffset.UtcNow.AddMinutes(-3);
        async Task Record(int seconds, double value) {
            client.DefaultRequestHeaders.Authorization = new("Bearer", ApiFactory.SensorKey);
            var reading = TelemetryTests.Reading("test-moisture", value); reading.Timestamp = start.AddSeconds(seconds);
            Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/telemetry", reading, Json)).StatusCode);
            client.DefaultRequestHeaders.Authorization = new("Bearer", ApiFactory.OperatorKey);
        }
        await Record(0, 340); await Record(10, 200);
        var input = await Calibration(client, id);
        Assert.Equal(HttpStatusCode.OK, (await client.PatchAsJsonAsync($"/api/sensors/{id}/calibration", input, Json)).StatusCode);
        var current = await client.GetFromJsonAsync<JsonElement>($"/api/sensors/{id}");
        Assert.Equal("adc", current.GetProperty("unit").GetString()); Assert.Equal("soil-moisture-raw", current.GetProperty("measurementType").GetString());
        Assert.Equal(0, current.GetProperty("consecutiveAbnormal").GetInt32()); Assert.Equal(561, current.GetProperty("baseline").GetDouble());
        Assert.Equal(HttpStatusCode.Conflict, (await client.PatchAsJsonAsync($"/api/sensors/{id}/calibration", input, Json)).StatusCode);
        await Record(20, 350);
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<WaterWatchDbContext>(); Assert.Empty(await db.SensorAnomalies.ToListAsync());
            Assert.False((await db.TelemetryReadings.OrderBy(x => x.MeasuredAtUtc).FirstAsync()).IsAbnormal);
        }
        await Record(30, 223); await Record(40, 223);
        var active = (await client.GetFromJsonAsync<SensorSummary[]>("/api/sensors", Json))!.Single().ActiveAnomaly;
        Assert.NotNull(active); Assert.Equal(561, active.Baseline); Assert.Equal(2, active.ConsecutiveReadings);
        using (var scope = factory.Services.CreateScope()) Assert.Single(await scope.ServiceProvider.GetRequiredService<WaterWatchDbContext>().SensorAnomalies.ToListAsync());
        await Record(50, 561);
        var recovered = (await client.GetFromJsonAsync<SensorSummary[]>("/api/sensors", Json))!.Single();
        Assert.Null(recovered.ActiveAnomaly); Assert.Equal(active.Id, recovered.LastRecoveredAnomaly!.Id); Assert.NotNull(recovered.LastRecoveredAnomaly.RecoveredAtUtc);
        using var finalScope = factory.Services.CreateScope(); var finalDb = finalScope.ServiceProvider.GetRequiredService<WaterWatchDbContext>();
        Assert.Equal(6, await finalDb.TelemetryReadings.CountAsync()); Assert.Single(await finalDb.Sensors.ToListAsync()); Assert.Empty(await finalDb.Incidents.ToListAsync());
    }
    [Fact]
    public async Task Calibration_RequiresStaff_AndRejectsInvalidRangeOrWrongSensor()
    {
        using var factory = new ApiFactory(); using var client = factory.CreateClient(); var id = await Register(client); var input = await Calibration(client, id);
        client.DefaultRequestHeaders.Authorization = null;
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PatchAsJsonAsync($"/api/sensors/{id}/calibration", input, Json)).StatusCode);
        client.DefaultRequestHeaders.Authorization = new("Bearer", ApiFactory.SensorKey);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PatchAsJsonAsync($"/api/sensors/{id}/calibration", input, Json)).StatusCode);
        client.DefaultRequestHeaders.Authorization = new("Bearer", ApiFactory.OperatorKey);
        input.Threshold = 1024;
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PatchAsJsonAsync($"/api/sensors/{id}/calibration", input, Json)).StatusCode);
        input.Threshold = 350; input.SensorKey = "wrong-sensor";
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PatchAsJsonAsync($"/api/sensors/{id}/calibration", input, Json)).StatusCode);
        input.SensorKey = "test-moisture"; input.RequiredConsecutive = 1;
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PatchAsJsonAsync($"/api/sensors/{id}/calibration", input, Json)).StatusCode);
    }
}
