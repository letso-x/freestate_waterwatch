namespace WaterWatch.Api.Services;

public sealed class MeasurementDefinition
{
    public string Unit { get; set; } = "";
    public double Minimum { get; set; }
    public double Maximum { get; set; }
}

public sealed class TelemetryOptions
{
    public Dictionary<string, MeasurementDefinition> Types { get; set; } = new();
    public bool IsValid() => Types.Count > 0 && Types.All(entry =>
        System.Text.RegularExpressions.Regex.IsMatch(entry.Key, "^[a-z0-9][a-z0-9-]{0,63}$") &&
        entry.Value.Unit.Length is > 0 and <= 16 && double.IsFinite(entry.Value.Minimum) &&
        double.IsFinite(entry.Value.Maximum) && entry.Value.Minimum < entry.Value.Maximum);
}
