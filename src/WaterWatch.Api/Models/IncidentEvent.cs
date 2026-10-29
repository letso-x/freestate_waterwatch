namespace WaterWatch.Api.Models;

public enum IncidentEventType { Created, StatusChanged, PriorityChanged, AssignmentChanged, NoteAdded }

public sealed class IncidentEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid IncidentId { get; set; }
    public IncidentEventType EventType { get; set; }
    public IncidentStatus? OldStatus { get; set; }
    public IncidentStatus? NewStatus { get; set; }
    public string? Note { get; set; }
    public string ActorIdentifier { get; set; } = string.Empty;
    public bool IsPublic { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
