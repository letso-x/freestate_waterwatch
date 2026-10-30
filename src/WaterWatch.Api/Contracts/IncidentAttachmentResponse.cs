using WaterWatch.Api.Models;

namespace WaterWatch.Api.Contracts;

public sealed record IncidentAttachmentResponse(
    Guid Id,
    IncidentAttachmentType AttachmentType,
    DateTime CreatedAtUtc);
