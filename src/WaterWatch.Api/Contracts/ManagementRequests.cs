using System.ComponentModel.DataAnnotations;
using WaterWatch.Api.Models;

namespace WaterWatch.Api.Contracts;

public sealed class StatusRequest
{
    [Required, EnumDataType(typeof(IncidentStatus))]
    public IncidentStatus? Status { get; init; }
    [StringLength(2000)] public string? Note { get; init; }
}
public sealed class PriorityRequest
{
    [Required, EnumDataType(typeof(IncidentPriority))]
    public IncidentPriority? Priority { get; init; }
    [StringLength(2000)] public string? Note { get; init; }
}
public sealed class AssignmentRequest
{
    [StringLength(120)] public string? AssignedTo { get; init; }
    [StringLength(2000)] public string? Note { get; init; }
}
public sealed class NoteRequest
{
    [Required, StringLength(2000, MinimumLength = 3)] public string Note { get; init; } = string.Empty;
}
public sealed record PublicProgressEvent(IncidentEventType EventType, IncidentStatus? OldStatus,
    IncidentStatus? NewStatus, string Summary, DateTime CreatedAtUtc);
public sealed record PublicTracking(Guid Id, string Title, string LocationDescription, IncidentStatus Status,
    DateTime CreatedAtUtc, DateTime UpdatedAtUtc, IReadOnlyList<PublicProgressEvent> Events);
