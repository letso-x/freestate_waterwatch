namespace WaterWatch.Api.Models;

public enum IncidentStatus { Reported, UnderReview, InProgress, Resolved }
public enum IncidentPriority { Low, Medium, High, Critical }

public sealed class Incident
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public IncidentStatus Status { get; set; } = IncidentStatus.Reported;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ResolvedAtUtc { get; set; }
    public IncidentPriority Priority { get; set; } = IncidentPriority.Medium;
    public string? AssignedTo { get; set; }
}
