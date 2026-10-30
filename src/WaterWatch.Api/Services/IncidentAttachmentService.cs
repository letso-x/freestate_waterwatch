using Microsoft.EntityFrameworkCore;
using WaterWatch.Api.Contracts;
using WaterWatch.Api.Data;
using WaterWatch.Api.Errors;
using WaterWatch.Api.Models;

namespace WaterWatch.Api.Services;

public sealed class IncidentAttachmentService(
    WaterWatchDbContext db,
    IncidentAttachmentStorage storage,
    ILogger<IncidentAttachmentService> logger)
{
    private const int MaximumPerType = 3;

    public async Task<IncidentAttachmentResponse> UploadAsync(
        Guid incidentId,
        IFormFile photo,
        IncidentAttachmentType type,
        string uploadedBy,
        CancellationToken cancellationToken,
        Guid? uploadId = null)
    {
        var image = await ImagePayloadValidator.ReadAsync(photo, cancellationToken);
        if (uploadId == Guid.Empty) throw new IncidentWorkflowException(400, "The upload reference is invalid.");
        var hash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(image.Bytes));
        await using var transaction = db.Database.CurrentTransaction is null ? await db.Database.BeginTransactionAsync(cancellationToken) : null;
        // Keep the existing three-photo limit safe across concurrent API instances.
        var incident = db.Database.IsNpgsql()
            ? await db.Incidents.FromSqlInterpolated($"SELECT * FROM \"Incidents\" WHERE \"Id\" = {incidentId} FOR UPDATE").SingleOrDefaultAsync(cancellationToken)
            : await db.Incidents.SingleOrDefaultAsync(x => x.Id == incidentId, cancellationToken);
        if (incident is null)
            throw new IncidentWorkflowException(404, "No incident exists for this reference.");
        if (uploadId is { } priorId)
        {
            var prior = await db.IncidentAttachments.AsNoTracking().SingleOrDefaultAsync(x => x.Id == priorId, cancellationToken);
            if (prior is not null)
            {
                if (prior.IncidentId != incidentId || prior.AttachmentType != type || prior.Sha256 != hash)
                    throw new IncidentWorkflowException(409, "That upload reference was already used for a different photo.");
                return ToResponse(prior);
            }
        }
        var count = await db.IncidentAttachments.CountAsync(
            x => x.IncidentId == incidentId && x.AttachmentType == type, cancellationToken);
        if (count >= MaximumPerType)
            throw new IncidentWorkflowException(400, $"An incident can have at most {MaximumPerType} photos of this type.");

        var id = uploadId ?? Guid.NewGuid();
        var path = $"{incidentId:N}/{type}/{id:N}{image.Extension}";
        var attemptedStore = false;
        try
        {
            attemptedStore = true;
            await storage.StoreAsync(path, image.Bytes, image.ContentType, cancellationToken);
        }
        catch (HttpRequestException error)
        {
            await CleanupAsync(path);
            logger.LogWarning(error, "Evidence upload failed before storage acknowledged the object for incident {IncidentId}.", incidentId);
            throw new IncidentWorkflowException(503, "Photo storage is temporarily unavailable.");
        }
        catch (IncidentWorkflowException)
        {
            await CleanupAsync(path);
            throw;
        }

        var attachment = new IncidentAttachment
        {
            Id = id,
            IncidentId = incidentId,
            StoragePath = path,
            OriginalFileName = SafeFileName(photo.FileName),
            ContentType = image.ContentType,
            FileSize = image.Bytes.Length,
            Sha256 = hash,
            AttachmentType = type,
            UploadedBy = uploadedBy,
            CreatedAtUtc = DateTime.UtcNow
        };
        db.IncidentAttachments.Add(attachment);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
            if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        }
        catch
        {
            if (attemptedStore) await CleanupAsync(path);
            throw;
        }
        return ToResponse(attachment);
    }

    public Task<List<IncidentAttachmentResponse>> ListAsync(Guid incidentId, CancellationToken cancellationToken) =>
        db.IncidentAttachments.AsNoTracking()
            .Where(x => x.IncidentId == incidentId)
            .OrderBy(x => x.CreatedAtUtc).ThenBy(x => x.Id)
            .Select(x => new IncidentAttachmentResponse(x.Id, x.AttachmentType, x.CreatedAtUtc))
            .ToListAsync(cancellationToken);

    public async Task<(byte[] Bytes, string ContentType)> RetrieveAsync(
        Guid incidentId,
        Guid attachmentId,
        CancellationToken cancellationToken)
    {
        var attachment = await db.IncidentAttachments.AsNoTracking()
            .SingleOrDefaultAsync(x => x.IncidentId == incidentId && x.Id == attachmentId, cancellationToken)
            ?? throw new IncidentWorkflowException(404, "Evidence photo not found.");
        var bytes = await storage.RetrieveAsync(attachment.StoragePath, cancellationToken);
        if (Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(bytes)) != attachment.Sha256)
            throw new IncidentWorkflowException(503, "The stored photo could not be verified.");
        return (bytes, attachment.ContentType);
    }

    private async Task CleanupAsync(string path)
    {
        try
        {
            await storage.DeleteAsync(path, CancellationToken.None);
        }
        catch (Exception error)
        {
            logger.LogError(error, "Could not remove a partially stored evidence object. The object may require storage cleanup.");
        }
    }

    private static string SafeFileName(string value)
    {
        var name = Path.GetFileName(value.Replace('\\', '/'));
        var safe = new string(name.Where(character => !char.IsControl(character)).Take(255).ToArray());
        return string.IsNullOrWhiteSpace(safe) ? "photo" : safe;
    }

    private static IncidentAttachmentResponse ToResponse(IncidentAttachment value) =>
        new(value.Id, value.AttachmentType, value.CreatedAtUtc);
}
