using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using WaterWatch.Api.Contracts;
using WaterWatch.Api.Data;
using WaterWatch.Api.Errors;
using WaterWatch.Api.Models;

namespace WaterWatch.Api.Services;

public sealed class TelemetryService(WaterWatchDbContext db, IOptions<TelemetryOptions> options)
{
    private MeasurementDefinition Definition(string type) => options.Value.Types.TryGetValue(type, out var definition)
        ? definition : throw new IncidentWorkflowException(400, "This measurement type is not configured.");

    public async Task<Sensor> RegisterAsync(RegisterSensorRequest input, CancellationToken ct)
    {
        var type = Definition(input.MeasurementType);
        var baseline = input.Baseline!.Value; var threshold = input.Threshold!.Value; var deviation = input.MinimumDeviation!.Value;
        if (input.Name.Trim().Length < 3 || input.Location.Trim().Length < 3 ||
            !double.IsFinite(baseline) || !double.IsFinite(threshold) || !double.IsFinite(deviation) ||
            baseline < type.Minimum || baseline > type.Maximum || threshold < type.Minimum || threshold > type.Maximum ||
            deviation <= 0 || deviation > type.Maximum - type.Minimum ||
            (input.Direction == ThresholdDirection.Above ? threshold <= baseline : threshold >= baseline))
            throw new IncidentWorkflowException(400, "Provide a valid baseline, threshold, positive deviation, name and location. The threshold must lie on the selected side of the baseline.");
        if (await db.Sensors.AnyAsync(x => x.SensorKey == input.SensorKey, ct))
            throw new IncidentWorkflowException(409, "This sensor is already registered.");
        var sensor = new Sensor { SensorKey = input.SensorKey, Name = input.Name.Trim(), Location = input.Location.Trim(),
            MeasurementType = input.MeasurementType, Unit = type.Unit, Source = input.Source!.Value,
            Baseline = baseline, Threshold = threshold, MinimumDeviation = deviation, Direction = input.Direction!.Value,
            RequiredConsecutive = input.RequiredConsecutive, StaleAfterSeconds = input.StaleAfterSeconds };
        db.Sensors.Add(sensor);
        await db.SaveChangesAsync(ct);
        return sensor;
    }

    public async Task<Sensor> GetSensorAsync(Guid id, CancellationToken ct) =>
        await db.Sensors.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new IncidentWorkflowException(404, "Sensor not found.");

    public async Task<Sensor> CalibrateAsync(Guid id, SensorCalibrationRequest input, CancellationToken ct)
    {
        await using var transaction = db.Database.CurrentTransaction is null ? await db.Database.BeginTransactionAsync(ct) : null;
        var sensor = db.Database.IsNpgsql()
            ? await db.Sensors.FromSqlInterpolated($"SELECT * FROM \"Sensors\" WHERE \"Id\" = {id} FOR UPDATE").SingleOrDefaultAsync(ct)
            : await db.Sensors.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (sensor is null) throw new IncidentWorkflowException(404, "Sensor not found.");
        if (sensor.SensorKey != input.SensorKey) throw new IncidentWorkflowException(400, "The sensor reference does not match the intended sensor.");
        if (sensor.Version != input.ExpectedVersion) throw new IncidentWorkflowException(409, "The sensor changed. Read its latest settings before updating calibration.");
        var type = Definition(sensor.MeasurementType);
        var baseline = input.Baseline!.Value; var threshold = input.Threshold!.Value; var deviation = input.MinimumDeviation!.Value;
        if (!double.IsFinite(baseline) || !double.IsFinite(threshold) || !double.IsFinite(deviation) ||
            baseline < type.Minimum || baseline > type.Maximum || threshold < type.Minimum || threshold > type.Maximum ||
            deviation <= 0 || deviation > type.Maximum - type.Minimum ||
            (input.Direction == ThresholdDirection.Above ? threshold <= baseline : threshold >= baseline))
            throw new IncidentWorkflowException(400, "Calibration must use the configured measurement range, a positive deviation and a threshold on the selected side of the baseline.");
        sensor.Baseline = baseline; sensor.Threshold = threshold; sensor.MinimumDeviation = deviation;
        sensor.Direction = input.Direction!.Value; sensor.RequiredConsecutive = input.RequiredConsecutive;
        // Start fresh evidence under the new rule. Historical readings and anomaly snapshots are untouched.
        sensor.ConsecutiveAbnormal = 0; sensor.Version = Guid.NewGuid();
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return sensor;
    }

    public async Task<IngestionResult> IngestAsync(TelemetryRequest input, CancellationToken ct)
    {
        var type = Definition(input.MeasurementType);
        var now = DateTime.UtcNow;
        var measured = input.Timestamp!.Value.UtcDateTime;
        measured = new DateTime(measured.Ticks / 10 * 10, DateTimeKind.Utc);
        if (input.MeasurementId == Guid.Empty || !double.IsFinite(input.Value!.Value) || input.Value < type.Minimum ||
            input.Value > type.Maximum || input.Unit != type.Unit || measured > now.AddMinutes(2) || measured < now.AddHours(-24))
            throw new IncidentWorkflowException(400, "Check the measurement identity, value, unit and timestamp. Readings must be from the last 24 hours and no more than two minutes ahead.");

        // Serialize each sensor's state changes across API instances. Tests may own an outer transaction.
        await using var transaction = db.Database.CurrentTransaction is null ? await db.Database.BeginTransactionAsync(ct) : null;
        var sensor = db.Database.IsNpgsql()
            ? await db.Sensors.FromSqlInterpolated($"SELECT * FROM \"Sensors\" WHERE \"SensorKey\" = {input.SensorKey} FOR UPDATE").SingleOrDefaultAsync(ct)
            : await db.Sensors.SingleOrDefaultAsync(x => x.SensorKey == input.SensorKey, ct);
        if (sensor is null) throw new IncidentWorkflowException(404, "Register this sensor before sending readings.");
        if (sensor.MeasurementType != input.MeasurementType || sensor.Unit != input.Unit || sensor.Source != input.Source)
            throw new IncidentWorkflowException(400, "The measurement type, unit or source does not match the registered sensor.");
        var previous = await db.TelemetryReadings.SingleOrDefaultAsync(x => x.SensorId == sensor.Id && x.MeasurementId == input.MeasurementId, ct);
        if (previous is not null)
        {
            if (previous.Value != input.Value || previous.MeasuredAtUtc != measured)
                throw new IncidentWorkflowException(409, "This measurement identity was already used for different data.");
            return new IngestionResult(previous, true);
        }
        if (sensor.LastMeasuredAtUtc is { } last && measured <= last)
            throw new IncidentWorkflowException(409, "This reading is older than or equal to the last recorded measurement.");
        var abnormal = IsAbnormal(sensor, input.Value.Value);
        if (sensor.LastMeasuredAtUtc is { } before && (measured - before).TotalSeconds > sensor.StaleAfterSeconds)
            sensor.ConsecutiveAbnormal = 0;
        sensor.ConsecutiveAbnormal = abnormal ? Math.Min(sensor.ConsecutiveAbnormal + 1, sensor.RequiredConsecutive) : 0;
        var active = await db.SensorAnomalies.SingleOrDefaultAsync(x => x.SensorId == sensor.Id && x.RecoveredAtUtc == null, ct);
        if (abnormal && sensor.ConsecutiveAbnormal >= sensor.RequiredConsecutive && active is null)
            db.SensorAnomalies.Add(new SensorAnomaly { SensorId = sensor.Id, StartedAtUtc = measured, TriggerValue = input.Value.Value,
                Baseline = sensor.Baseline, Threshold = sensor.Threshold, MinimumDeviation = sensor.MinimumDeviation,
                Direction = sensor.Direction, ConsecutiveReadings = sensor.RequiredConsecutive, Source = sensor.Source });
        if (!abnormal && active is not null) active.RecoveredAtUtc = measured;
        sensor.LastMeasuredAtUtc = measured; sensor.LastReceivedAtUtc = now; sensor.LatestValue = input.Value;
        sensor.Version = Guid.NewGuid();
        var reading = new TelemetryReading { SensorId = sensor.Id, MeasurementId = input.MeasurementId!.Value,
            MeasurementType = input.MeasurementType, Value = input.Value.Value, Unit = input.Unit, Source = input.Source!.Value,
            MeasuredAtUtc = measured, ReceivedAtUtc = now, IsAbnormal = abnormal };
        db.TelemetryReadings.Add(reading);
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return new IngestionResult(reading, false);
    }

    public static bool IsAbnormal(Sensor sensor, double value) => sensor.Direction == ThresholdDirection.Above
        ? value >= sensor.Threshold && value - sensor.Baseline >= sensor.MinimumDeviation
        : value <= sensor.Threshold && sensor.Baseline - value >= sensor.MinimumDeviation;

    public async Task<List<SensorSummary>> GetSensorsAsync(int page, int pageSize, CancellationToken ct)
    {
        var sensors = await db.Sensors.AsNoTracking().OrderBy(x => x.SensorKey).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        var ids = sensors.Select(x => x.Id).ToArray();
        var anomalies = await db.SensorAnomalies.AsNoTracking().Where(x => ids.Contains(x.SensorId) && x.RecoveredAtUtc == null).ToListAsync(ct);
        var recovered = await db.SensorAnomalies.AsNoTracking().Where(x => ids.Contains(x.SensorId) && x.RecoveredAtUtc != null &&
            !db.SensorAnomalies.Any(other => other.SensorId == x.SensorId && other.RecoveredAtUtc > x.RecoveredAtUtc)).ToListAsync(ct);
        return sensors.Select(x => new SensorSummary(x.Id, x.SensorKey, x.Name, x.Location, x.MeasurementType, x.Unit, x.Source,
            x.LatestValue, x.LastMeasuredAtUtc, x.LastReceivedAtUtc, x.StaleAfterSeconds, anomalies.SingleOrDefault(a => a.SensorId == x.Id), recovered.SingleOrDefault(a => a.SensorId == x.Id))).ToList();
    }

    public async Task<List<TelemetryReading>> ReadingsAsync(Guid id, int limit, CancellationToken ct)
    {
        if (!await db.Sensors.AnyAsync(x => x.Id == id, ct)) throw new IncidentWorkflowException(404, "Sensor not found.");
        return await db.TelemetryReadings.AsNoTracking().Where(x => x.SensorId == id)
            .OrderByDescending(x => x.MeasuredAtUtc).ThenByDescending(x => x.Id).Take(limit).ToListAsync(ct);
    }
}
