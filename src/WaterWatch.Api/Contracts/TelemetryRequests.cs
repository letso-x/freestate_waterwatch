using System.ComponentModel.DataAnnotations;
using WaterWatch.Api.Models;

namespace WaterWatch.Api.Contracts;

public sealed class TelemetryRequest
{
    [Required, RegularExpression("^[a-z0-9][a-z0-9-]{0,63}$")] public string SensorKey { get; set; } = "";
    [Required] public Guid? MeasurementId { get; set; }
    [Required, StringLength(64)] public string MeasurementType { get; set; } = "";
    [Required] public double? Value { get; set; }
    [Required, StringLength(16)] public string Unit { get; set; } = "";
    [Required] public DateTimeOffset? Timestamp { get; set; }
    [Required] public TelemetrySource? Source { get; set; }
}

public sealed class RegisterSensorRequest
{
    [Required, RegularExpression("^[a-z0-9][a-z0-9-]{0,63}$")] public string SensorKey { get; set; } = "";
    [Required, StringLength(120, MinimumLength = 3)] public string Name { get; set; } = "";
    [Required, StringLength(300, MinimumLength = 3)] public string Location { get; set; } = "";
    [Required, StringLength(64)] public string MeasurementType { get; set; } = "";
    [Required] public TelemetrySource? Source { get; set; }
    [Required] public double? Baseline { get; set; }
    [Required] public double? Threshold { get; set; }
    [Required] public double? MinimumDeviation { get; set; }
    [Required] public ThresholdDirection? Direction { get; set; }
    [Range(2, 100)] public int RequiredConsecutive { get; set; } = 3;
    [Range(10, 86400)] public int StaleAfterSeconds { get; set; } = 120;
}

public sealed record SensorSummary(Guid Id, string SensorKey, string Name, string Location, string MeasurementType,
    string Unit, TelemetrySource Source, double? LatestValue, DateTime? LastMeasuredAtUtc, DateTime? LastReceivedAtUtc,
    int StaleAfterSeconds, SensorAnomaly? ActiveAnomaly, SensorAnomaly? LastRecoveredAnomaly = null);
public sealed record IngestionResult(TelemetryReading Reading, bool Duplicate);

public sealed class SensorCalibrationRequest
{
    [Required, RegularExpression("^[a-z0-9][a-z0-9-]{0,63}$")] public string SensorKey { get; set; } = "";
    [Required] public Guid? ExpectedVersion { get; set; }
    [Required] public double? Baseline { get; set; }
    [Required] public double? Threshold { get; set; }
    [Required] public double? MinimumDeviation { get; set; }
    [Required] public ThresholdDirection? Direction { get; set; }
    [Range(2, 100)] public int RequiredConsecutive { get; set; } = 2;
}
