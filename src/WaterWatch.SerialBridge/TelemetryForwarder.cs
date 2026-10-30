using System.Net;
using System.Net.Http.Json;

namespace WaterWatch.SerialBridge;

public sealed record BridgeMeasurement(string SensorKey, Guid MeasurementId, string MeasurementType, double Value,
    string Unit, DateTimeOffset Timestamp, string Source = "Physical");

public sealed class TelemetryForwarder(HttpClient client)
{
    public async Task<bool> SendAsync(BridgeMeasurement measurement, CancellationToken ct)
    {
        // Retries reuse the exact identity and timestamp; never reclassify test data as physical.
        for (var attempt = 0; attempt < 5; attempt++)
        {
            try
            {
                using var response = await client.PostAsJsonAsync("api/telemetry", measurement, ct);
                if (response.IsSuccessStatusCode) return true;
                if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
                    throw new InvalidOperationException("Ingestion access was rejected. Check the saved credential and server configuration.");
                if ((int)response.StatusCode < 500 && response.StatusCode != HttpStatusCode.TooManyRequests)
                {
                    Console.WriteLine("Reading rejected (HTTP " + (int)response.StatusCode + "). Check sensor registration, units, range and clock.");
                    return false;
                }
            }
            catch (HttpRequestException) { }
            catch (TaskCanceledException) when (!ct.IsCancellationRequested) { }
            if (attempt < 4) await Task.Delay(TimeSpan.FromSeconds(Math.Min(1 << attempt, 8)), ct);
        }
        Console.WriteLine("Delivery unconfirmed after five attempts. The bridge does not keep an offline copy.");
        return false;
    }
}
