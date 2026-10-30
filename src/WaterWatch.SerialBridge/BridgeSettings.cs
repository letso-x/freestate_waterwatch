namespace WaterWatch.SerialBridge;

public sealed record BridgeSettings(string ComPort, int BaudRate, Uri ApiUrl, string IngestionKey,
    string SensorKey, string MeasurementType, string Unit, double Minimum, double Maximum, bool DtrEnable)
{
    public static BridgeSettings FromEnvironment()
    {
        string Required(string name) => Environment.GetEnvironmentVariable("Bridge__" + name) is { Length: > 0 } value
            ? value : throw new InvalidOperationException("Set Bridge__" + name + ".");
        var port = Required("ComPort");
        var key = Required("IngestionKey");
        if (!Uri.TryCreate(Required("ApiUrl"), UriKind.Absolute, out var url) ||
            !(url.Scheme == "https" || url.Scheme == "http" && url.IsLoopback) ||
            !string.IsNullOrEmpty(url.UserInfo) || !string.IsNullOrEmpty(url.Query) || !string.IsNullOrEmpty(url.Fragment))
            throw new InvalidOperationException("Bridge__ApiUrl must be HTTPS, or loopback HTTP, without credentials or a query.");
        if (key.Length is < 32 or > 512 || key.Contains('\r') || key.Contains('\n'))
            throw new InvalidOperationException("Bridge__IngestionKey must contain 32–512 characters.");
        var sensor = Required("SensorKey");
        if (!System.Text.RegularExpressions.Regex.IsMatch(sensor, "^[a-z0-9][a-z0-9-]{0,63}$"))
            throw new InvalidOperationException("Bridge__SensorKey is not valid.");
        if (!int.TryParse(Environment.GetEnvironmentVariable("Bridge__BaudRate") ?? "9600", out var baud) || baud is < 300 or > 2000000)
            throw new InvalidOperationException("Bridge__BaudRate is not valid.");
        double Number(string name, string fallback) => double.TryParse(Environment.GetEnvironmentVariable("Bridge__" + name) ?? fallback,
            System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var number) && double.IsFinite(number)
            ? number : throw new InvalidOperationException("Bridge__" + name + " is not valid.");
        var min = Number("Minimum", "0"); var max = Number("Maximum", "1023");
        if (min >= max) throw new InvalidOperationException("Bridge__Minimum must be below Bridge__Maximum.");
        var type = Environment.GetEnvironmentVariable("Bridge__MeasurementType") ?? "soil-moisture-raw";
        var unit = Environment.GetEnvironmentVariable("Bridge__Unit") ?? "adc";
        if (type.Length is < 1 or > 64 || unit.Length is < 1 or > 16)
            throw new InvalidOperationException("Bridge measurement type or unit is not valid.");
        return new(port, baud, url, key, sensor, type, unit, min, max,
            string.Equals(Environment.GetEnvironmentVariable("Bridge__DtrEnable"), "true", StringComparison.OrdinalIgnoreCase));
    }
}
