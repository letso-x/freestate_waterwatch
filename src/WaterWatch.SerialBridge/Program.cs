using System.IO.Ports;
using System.Net.Http.Headers;
using System.Text;
using WaterWatch.SerialBridge;

using var stop = new CancellationTokenSource();
Console.CancelKeyPress += (_, args) => { args.Cancel = true; stop.Cancel(); };
try
{
    var settings = BridgeSettings.FromEnvironment();
    using var handler = new HttpClientHandler { AllowAutoRedirect = false };
    using var http = new HttpClient(handler) { BaseAddress = new Uri(settings.ApiUrl.ToString().TrimEnd('/') + "/"), Timeout = TimeSpan.FromSeconds(10) };
    http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", settings.IngestionKey);
    var forwarder = new TelemetryForwarder(http);
    Console.WriteLine("WaterWatch serial bridge. Press Ctrl+C to stop.");
    while (!stop.IsCancellationRequested)
    {
        try
        {
            using var serial = new SerialPort(settings.ComPort, settings.BaudRate) { ReadTimeout = 500, DtrEnable = settings.DtrEnable, Encoding = Encoding.ASCII };
            serial.Open();
            serial.DiscardInBuffer();
            Console.WriteLine("Serial connection opened. Waiting for measurements.");
            var buffer = new StringBuilder(); var discard = false;
            while (!stop.IsCancellationRequested)
            {
                int next;
                try { next = serial.ReadChar(); }
                catch (TimeoutException) { continue; }
                catch (InvalidOperationException) { throw new IOException(); }
                if (next < 0) throw new IOException();
                if (next == '\n')
                {
                    if (!discard && SerialProtocol.TryParse(buffer.ToString().TrimEnd('\r'), settings.Minimum, settings.Maximum, out var value))
                    {
                        var reading = new BridgeMeasurement(settings.SensorKey, Guid.NewGuid(), settings.MeasurementType, value, settings.Unit, DateTimeOffset.UtcNow);
                        var accepted = await forwarder.SendAsync(reading, stop.Token);
                        // Avoid fresh timestamps on samples queued during HTTP retries.
                        serial.DiscardInBuffer();
                        if (accepted) Console.WriteLine("Measurement accepted.");
                    }
                    else Console.WriteLine("Malformed or out-of-range serial measurement ignored.");
                    buffer.Clear(); discard = false;
                }
                else if (!discard)
                {
                    if (buffer.Length >= SerialProtocol.MaximumLineLength) { buffer.Clear(); discard = true; }
                    else buffer.Append((char)next);
                }
            }
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Security.SecurityException)
        {
            Console.WriteLine("Serial connection unavailable. Reconnecting in three seconds.");
            await Task.Delay(3000, stop.Token);
        }
    }
}
catch (OperationCanceledException) when (stop.IsCancellationRequested) { }
catch (InvalidOperationException error) { Console.Error.WriteLine(error.Message); Environment.ExitCode = 1; }
catch (Exception) { Console.Error.WriteLine("The bridge stopped unexpectedly. Check the serial and service configuration."); Environment.ExitCode = 1; }
