namespace WaterWatch.Api.Models;

public enum IncidentStatus { Reported }

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
}
