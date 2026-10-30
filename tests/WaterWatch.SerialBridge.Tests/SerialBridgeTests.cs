using System.Net;
using System.Text.Json;
using WaterWatch.SerialBridge;

namespace WaterWatch.SerialBridge.Tests;

public sealed class SerialBridgeTests
{
    [Theory]
    [InlineData("{\"value\":412}", true, 412)]
    [InlineData("{\"value\":0}", true, 0)]
    [InlineData("{\"value\":1023}\r", true, 1023)]
    [InlineData("{\"value\":12.5}", true, 12.5)]
    [InlineData("{\"value\":-1}", false, 0)]
    [InlineData("{\"value\":1024}", false, 0)]
    [InlineData("{\"value\":\"412\"}", false, 0)]
    [InlineData("{\"value\":1e999}", false, 0)]
    [InlineData("{\"value\":NaN}", false, 0)]
    [InlineData("{\"value\":3,\"value\":4}", false, 0)]
    [InlineData("{\"value\":3,\"secret\":\"never log raw input\"}", false, 0)]
    [InlineData("Booting Arduino...", false, 0)]
    [InlineData("{}", false, 0)]
    [InlineData("[]", false, 0)]
    public void SerialProtocol_ValidatesFiniteBoundedNumericMeasurements(string input, bool valid, double expected)
    {
        Assert.Equal(valid, SerialProtocol.TryParse(input, 0, 1023, out var value));
        if (valid) Assert.Equal(expected, value);
    }
    [Fact]
    public void OversizedLine_IsRejected() => Assert.False(SerialProtocol.TryParse(new string(' ', 257), 0, 1023, out _));

    [Fact]
    public async Task Retry_ReusesMeasurementIdentityTimestampAndPhysicalSource()
    {
        var handler = new CaptureHandler(HttpStatusCode.ServiceUnavailable, HttpStatusCode.Created);
        using var client = new HttpClient(handler) { BaseAddress = new Uri("http://localhost:5100/") };
        var input = new BridgeMeasurement("arduino-01", Guid.NewGuid(), "soil-moisture-raw", 412, "adc", DateTimeOffset.UtcNow);
        Assert.True(await new TelemetryForwarder(client).SendAsync(input, CancellationToken.None));
        Assert.Equal(2, handler.Bodies.Count); Assert.Equal(handler.Bodies[0], handler.Bodies[1]);
        using var payload = JsonDocument.Parse(handler.Bodies[0]); Assert.Equal("Physical", payload.RootElement.GetProperty("source").GetString());
    }
    [Fact]
    public async Task Unauthorized_FailsWithoutRetriedCredentialOrResponseLogging()
    {
        var handler = new CaptureHandler(HttpStatusCode.Unauthorized);
        using var client = new HttpClient(handler) { BaseAddress = new Uri("http://localhost:5100/") };
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => new TelemetryForwarder(client).SendAsync(
            new("arduino-01", Guid.NewGuid(), "soil-moisture-raw", 412, "adc", DateTimeOffset.UtcNow), CancellationToken.None));
        Assert.DoesNotContain("server secret", error.Message); Assert.Single(handler.Bodies);
    }
    [Fact]
    public async Task InvalidReading_IsNotRetried()
    {
        var handler = new CaptureHandler(HttpStatusCode.BadRequest);
        using var client = new HttpClient(handler) { BaseAddress = new Uri("http://localhost:5100/") };
        Assert.False(await new TelemetryForwarder(client).SendAsync(new("arduino-01", Guid.NewGuid(), "soil-moisture-raw", 412, "adc", DateTimeOffset.UtcNow), CancellationToken.None));
        Assert.Single(handler.Bodies);
    }
    private sealed class CaptureHandler(params HttpStatusCode[] statuses) : HttpMessageHandler
    {
        public List<string> Bodies { get; } = [];
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Bodies.Add(await request.Content!.ReadAsStringAsync(ct));
            return new HttpResponseMessage(statuses[Math.Min(Bodies.Count - 1, statuses.Length - 1)]) { Content = new StringContent("server secret should never be logged") };
        }
    }
}
