using System.Text.Json;

namespace WaterWatch.SerialBridge;

public static class SerialProtocol
{
    public const int MaximumLineLength = 256;
    // The bridge supplies identity, calibrated measurement type, source and UTC receipt time.
    public static bool TryParse(string line, double minimum, double maximum, out double value)
    {
        value = 0;
        if (line.Length > MaximumLineLength) return false;
        try
        {
            using var document = JsonDocument.Parse(line);
            if (document.RootElement.ValueKind != JsonValueKind.Object) return false;
            var properties = document.RootElement.EnumerateObject().ToArray();
            return properties.Length == 1 && properties[0].Name == "value" &&
                properties[0].Value.ValueKind == JsonValueKind.Number && properties[0].Value.TryGetDouble(out value) &&
                double.IsFinite(value) && value >= minimum && value <= maximum;
        }
        catch (JsonException) { return false; }
    }
}
