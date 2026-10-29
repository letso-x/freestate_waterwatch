using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using WaterWatch.Api.Contracts;
using WaterWatch.Api.Models;
using WaterWatch.Api.Services;

namespace WaterWatch.Api.Controllers;

[ApiController]
[Route("api/incidents")]

public sealed class IncidentsController(IncidentService service) : ControllerBase
{
    [HttpPost]
    [ProducesResponseType<Incident>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<Incident>> Create(CreateIncidentRequest request, CancellationToken cancellationToken) =>
        StatusCode(StatusCodes.Status201Created, await service.CreateAsync(request, cancellationToken));

    [HttpGet("{id:guid}")]
    [ProducesResponseType<Incident>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<Incident>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var incident = await service.GetByIdAsync(id, cancellationToken);
        return incident is null ? NotFound() : Ok(incident);
    }

    [HttpGet]
    [ProducesResponseType<List<Incident>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<List<Incident>>> Get(
        [FromQuery, Range(1, 1000000)] int page = 1,
        [FromQuery, Range(1, 100)] int pageSize = 50,
        CancellationToken cancellationToken = default) =>
        Ok(await service.GetAsync(page, pageSize, cancellationToken));
}
