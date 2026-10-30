namespace WaterWatch.Api.Models;

public enum TelemetrySource { Physical, Synthetic }
public enum ThresholdDirection { Above, Below }

public sealed class Sensor
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string SensorKey { get; set; } = "";
    public string Name { get; set; } = "";
    public string Location { get; set; } = "";
    public string MeasurementType { get; set; } = "";
    public string Unit { get; set; } = "";
    public TelemetrySource Source { get; set; }
    public double Baseline { get; set; }
    public double Threshold { get; set; }
    public double MinimumDeviation { get; set; }
    public ThresholdDirection Direction { get; set; }
    public int RequiredConsecutive { get; set; } = 3;
    public int StaleAfterSeconds { get; set; } = 120;
    public int ConsecutiveAbnormal { get; set; }
    public DateTime? LastMeasuredAtUtc { get; set; }
    public DateTime? LastReceivedAtUtc { get; set; }
    public double? LatestValue { get; set; }
    public Guid Version { get; set; } = Guid.NewGuid();
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class TelemetryReading
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SensorId { get; set; }
    public Guid MeasurementId { get; set; }
    public string MeasurementType { get; set; } = "";
    public double Value { get; set; }
    public string Unit { get; set; } = "";
    public TelemetrySource Source { get; set; }
    public DateTime MeasuredAtUtc { get; set; }
    public DateTime ReceivedAtUtc { get; set; } = DateTime.UtcNow;
    public bool IsAbnormal { get; set; }
}

// A sensor observation is not a confirmed leak or a resident report.
public sealed class SensorAnomaly
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SensorId { get; set; }
    public DateTime StartedAtUtc { get; set; }
    public DateTime? RecoveredAtUtc { get; set; }
    public double TriggerValue { get; set; }
    public double Baseline { get; set; }
    public double Threshold { get; set; }
    public double MinimumDeviation { get; set; }
    public ThresholdDirection Direction { get; set; }
    public int ConsecutiveReadings { get; set; }
    public TelemetrySource Source { get; set; }
}
