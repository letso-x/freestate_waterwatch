using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using WaterWatch.Api.Contracts;
using WaterWatch.Api.Models;
using WaterWatch.Api.Services;
using Microsoft.AspNetCore.Http;

namespace WaterWatch.Api.Controllers;

[ApiController]
[Route("api/incidents")]
[Authorize(Policy = "Operator")]
public sealed class IncidentsController(IncidentService service, ResidentUploadCapability capability, IncidentAttachmentStorage storage, IWebHostEnvironment environment) : ControllerBase
{
    private string Actor => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    [HttpPost, AllowAnonymous]
    [ProducesResponseType<Incident>(201)]
    [ProducesResponseType<ValidationProblemDetails>(400)]
    [ProducesResponseType<ProblemDetails>(503)]
    public async Task<ActionResult<Incident>> Create(CreateIncidentRequest request, CancellationToken cancellationToken)
    {
        if (request.RequestPhotoUploadCapability)
        {
            if (!Request.IsHttps && !environment.IsDevelopment())
                return StatusCode(503, new ProblemDetails { Status = 503, Title = "Photo uploads require HTTPS." });
            capability.EnsureConfigured();
            storage.EnsureConfigured();
        }
        var incident = await service.CreateAsync(request, cancellationToken);
        if (request.RequestPhotoUploadCapability)
        {
            Response.Cookies.Append(ResidentUploadCapability.CookieName, capability.Create(incident.Id), new CookieOptions
            {
                HttpOnly = true,
                IsEssential = true,
                SameSite = Request.IsHttps ? SameSiteMode.None : SameSiteMode.Strict,
                Secure = Request.IsHttps,
                Path = $"/api/public/incidents/{incident.Id}/attachments",
                MaxAge = ResidentUploadCapability.Lifetime
            });
        }
        return StatusCode(201, incident);
    }

    [HttpGet("{id:guid}")]
    [ProducesResponseType<Incident>(200)]
    [ProducesResponseType<ProblemDetails>(404)]
    public async Task<ActionResult<Incident>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var incident = await service.GetByIdAsync(id, cancellationToken);
        return incident is null ? NotFound() : Ok(incident);
    }
    [HttpGet]
    [ProducesResponseType<List<Incident>>(200)]
    public async Task<ActionResult<List<Incident>>> Get(
        [FromQuery, System.ComponentModel.DataAnnotations.Range(1, 1000000)] int page = 1,
        [FromQuery, System.ComponentModel.DataAnnotations.Range(1, 100)] int pageSize = 50,
        CancellationToken cancellationToken = default) => Ok(await service.GetAsync(page, pageSize, cancellationToken));

    [HttpPatch("{id:guid}/status")]
    public async Task<ActionResult<Incident>> Status(Guid id, StatusRequest request, CancellationToken cancellationToken) =>
        Ok(await service.StatusAsync(id, request, Actor, cancellationToken));
    [HttpPatch("{id:guid}/priority")]
    public async Task<ActionResult<Incident>> Priority(Guid id, PriorityRequest request, CancellationToken cancellationToken) =>
        Ok(await service.PriorityAsync(id, request, Actor, cancellationToken));
    [HttpPatch("{id:guid}/assignment")]
    public async Task<ActionResult<Incident>> Assignment(Guid id, AssignmentRequest request, CancellationToken cancellationToken) =>
        Ok(await service.AssignmentAsync(id, request, Actor, cancellationToken));
    [HttpGet("{id:guid}/events")]
    public async Task<ActionResult<List<IncidentEvent>>> Events(Guid id, CancellationToken cancellationToken) =>
        Ok(await service.EventsAsync(id, cancellationToken));
    [HttpPost("{id:guid}/notes")]
    public async Task<ActionResult<IncidentEvent>> Note(Guid id, NoteRequest request, CancellationToken cancellationToken) =>
        StatusCode(201, await service.NoteAsync(id, request, Actor, cancellationToken));
}

[ApiController]
[Route("api/public/incidents")]
public sealed class PublicTrackingController(IncidentService service) : ControllerBase
{
    [HttpGet("{id:guid}/tracking"), AllowAnonymous]
    [ProducesResponseType<PublicTracking>(200)]
    [ProducesResponseType<ProblemDetails>(404)]
    public async Task<ActionResult<PublicTracking>> Get(Guid id, CancellationToken cancellationToken) =>
        Ok(await service.TrackingAsync(id, cancellationToken));
}
