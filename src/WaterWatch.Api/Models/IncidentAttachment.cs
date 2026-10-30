namespace WaterWatch.Api.Models;

public enum IncidentAttachmentType { ReportEvidence, RepairEvidence }

public sealed class IncidentAttachment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid IncidentId { get; set; }
    public string StoragePath { get; set; } = string.Empty;
    public string OriginalFileName { get; set; } = string.Empty;
    public string Sha256 { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public IncidentAttachmentType AttachmentType { get; set; }
    public string UploadedBy { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
