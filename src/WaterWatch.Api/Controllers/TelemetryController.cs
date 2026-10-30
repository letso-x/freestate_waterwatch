using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using WaterWatch.Api.Contracts;
using WaterWatch.Api.Models;
using WaterWatch.Api.Services;

namespace WaterWatch.Api.Controllers;

[ApiController, Route("api/telemetry")]
public sealed class TelemetryController(TelemetryService service) : ControllerBase
{
    [HttpPost, Authorize(Policy = "SensorIngestion"), RequestSizeLimit(4096)]
    [ProducesResponseType<IngestionResult>(201), ProducesResponseType<IngestionResult>(200)]
    [ProducesResponseType<ProblemDetails>(400), ProducesResponseType(401), ProducesResponseType(404), ProducesResponseType(409)]
    public async Task<ActionResult<IngestionResult>> Ingest(TelemetryRequest input, CancellationToken ct)
    {
        var result = await service.IngestAsync(input, ct);
        return StatusCode(result.Duplicate ? 200 : 201, result);
    }
}

[ApiController, Route("api/sensors"), Authorize(Policy = "Operator")]
public sealed class SensorsController(TelemetryService service) : ControllerBase
{
    [HttpGet, ProducesResponseType<List<SensorSummary>>(200)]
    public async Task<ActionResult<List<SensorSummary>>> Get(
        [FromQuery, Range(1, 1000000)] int page = 1, [FromQuery, Range(1, 100)] int pageSize = 50,
        CancellationToken ct = default) => Ok(await service.GetSensorsAsync(page, pageSize, ct));

    [HttpPost, ProducesResponseType<Sensor>(201)]
    public async Task<ActionResult<Sensor>> Register(RegisterSensorRequest input, CancellationToken ct) =>
        StatusCode(201, await service.RegisterAsync(input, ct));

    [HttpGet("{id:guid}"), ProducesResponseType<Sensor>(200)]
    public async Task<ActionResult<Sensor>> Details(Guid id, CancellationToken ct) => Ok(await service.GetSensorAsync(id, ct));

    [HttpPatch("{id:guid}/calibration"), ProducesResponseType<Sensor>(200)]
    public async Task<ActionResult<Sensor>> Calibrate(Guid id, SensorCalibrationRequest input, CancellationToken ct) =>
        Ok(await service.CalibrateAsync(id, input, ct));

    [HttpGet("{id:guid}/readings"), ProducesResponseType<List<TelemetryReading>>(200)]
    public async Task<ActionResult<List<TelemetryReading>>> Readings(Guid id, [FromQuery, Range(1, 200)] int limit = 60,
        CancellationToken ct = default) => Ok(await service.ReadingsAsync(id, limit, ct));
}
