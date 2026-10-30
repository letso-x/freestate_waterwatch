using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using WaterWatch.Api.Contracts;
using WaterWatch.Api.Models;
using WaterWatch.Api.Services;

namespace WaterWatch.Api.Controllers;

[ApiController]
[Route("api/incidents/{incidentId:guid}/attachments")]
public sealed class IncidentAttachmentsController(
    IncidentAttachmentService attachments,
    IncidentService incidents,
    ResidentUploadCapability capability,
    IConfiguration configuration, IWebHostEnvironment environment) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "Operator")]
    [ProducesResponseType<List<IncidentAttachmentResponse>>(200)]
    public async Task<ActionResult<List<IncidentAttachmentResponse>>> List(Guid incidentId, CancellationToken cancellationToken)
    {
        if (await incidents.GetByIdAsync(incidentId, cancellationToken) is null) return NotFound();
        return Ok(await attachments.ListAsync(incidentId, cancellationToken));
    }

    [HttpGet("{attachmentId:guid}/content")]
    [Authorize(Policy = "Operator")]
    [ProducesResponseType(typeof(FileContentResult), 200)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> Content(Guid incidentId, Guid attachmentId, CancellationToken cancellationToken)
    {
        var image = await attachments.RetrieveAsync(incidentId, attachmentId, cancellationToken);
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        Response.Headers["Content-Security-Policy"] = "sandbox";
        Response.Headers.CacheControl = "private, no-store";
        return File(image.Bytes, image.ContentType);
    }

    [HttpPost]
    [Authorize(Policy = "Operator")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(ImagePayloadValidator.MaximumBytes + 65536)]
    [ProducesResponseType<IncidentAttachmentResponse>(201)]
    [ProducesResponseType<ProblemDetails>(400)]
    [ProducesResponseType(401)]
    public async Task<ActionResult<IncidentAttachmentResponse>> UploadRepairEvidence(
        Guid incidentId,
        [FromForm] IFormFile? photo,
        [FromForm] Guid? uploadId,
        CancellationToken cancellationToken)
    {
        if (photo is null) return BadRequest(new ProblemDetails { Status = 400, Title = "A photo is required." });
        var actor = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "staff";
        var result = await attachments.UploadAsync(incidentId, photo, IncidentAttachmentType.RepairEvidence, actor, cancellationToken, uploadId);
        return StatusCode(StatusCodes.Status201Created, result);
    }

    [HttpPost("/api/public/incidents/{incidentId:guid}/attachments")]
    [AllowAnonymous]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(ImagePayloadValidator.MaximumBytes + 65536)]
    [ProducesResponseType<IncidentAttachmentResponse>(201)]
    [ProducesResponseType<ProblemDetails>(400)]
    [ProducesResponseType(401)]
    public async Task<ActionResult<IncidentAttachmentResponse>> UploadReportEvidence(
        Guid incidentId,
        [FromForm] IFormFile? photo,
        [FromForm] Guid? uploadId,
        CancellationToken cancellationToken)
    {
        if ((!Request.IsHttps && !environment.IsDevelopment()) || !HasAllowedOrigin()) return Unauthorized();
        if (!Request.Cookies.TryGetValue(ResidentUploadCapability.CookieName, out var token) ||
            !capability.IsValid(incidentId, token))
            return Unauthorized();
        if (photo is null) return BadRequest(new ProblemDetails { Status = 400, Title = "A photo is required." });
        var result = await attachments.UploadAsync(incidentId, photo, IncidentAttachmentType.ReportEvidence, "resident", cancellationToken, uploadId);
        return StatusCode(StatusCodes.Status201Created, result);
    }

    private bool HasAllowedOrigin()
    {
        var origin = Request.Headers.Origin.ToString();
        return origin.Length > 0 && (configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
            .Contains(origin, StringComparer.OrdinalIgnoreCase);
    }
}
