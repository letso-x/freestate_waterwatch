using Microsoft.EntityFrameworkCore;
using WaterWatch.Api.Contracts;
using WaterWatch.Api.Data;
using WaterWatch.Api.Errors;
using WaterWatch.Api.Models;

namespace WaterWatch.Api.Services;

public sealed class IncidentService(WaterWatchDbContext db)
{
    public async Task<Incident> CreateAsync(CreateIncidentRequest request, CancellationToken cancellationToken)
    {
        var now = UtcNow();
        var incident = new Incident
        {
            Title = request.Title.Trim(), Description = request.Description.Trim(),
            Location = request.Location.Trim(), Latitude = request.Latitude, Longitude = request.Longitude,
            CreatedAtUtc = now, UpdatedAtUtc = now
        };
        db.Incidents.Add(incident);
        AddEvent(incident, IncidentEventType.Created, null, IncidentStatus.Reported, null, "resident", true);
        await db.SaveChangesAsync(cancellationToken);
        return incident;
    }
    public Task<Incident?> GetByIdAsync(Guid id, CancellationToken cancellationToken) =>
        db.Incidents.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
    public Task<List<Incident>> GetAsync(int page, int pageSize, CancellationToken cancellationToken) =>
        db.Incidents.AsNoTracking().OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(cancellationToken);

    public async Task<List<IncidentEvent>> EventsAsync(Guid id, CancellationToken cancellationToken)
    {
        await RequireAsync(id, cancellationToken);
        return await db.IncidentEvents.AsNoTracking().Where(x => x.IncidentId == id)
            .OrderBy(x => x.CreatedAtUtc).ThenBy(x => x.Id).ToListAsync(cancellationToken);
    }

    public async Task<PublicTracking> TrackingAsync(Guid id, CancellationToken cancellationToken)
    {
        var incident = await RequireAsync(id, cancellationToken);
        // Project an explicit allowlist; never serialize entities or operator notes here.
        var events = await db.IncidentEvents.AsNoTracking()
            .Where(x => x.IncidentId == id && x.IsPublic && x.CreatedAtUtc <= incident.UpdatedAtUtc &&
                (x.EventType == IncidentEventType.Created || x.EventType == IncidentEventType.StatusChanged))
            .OrderBy(x => x.CreatedAtUtc).ThenBy(x => x.Id)
            .Select(x => new { x.EventType, x.OldStatus, x.NewStatus, x.CreatedAtUtc }).ToListAsync(cancellationToken);
        var progress = events.Select(x => new PublicProgressEvent(x.EventType, x.OldStatus, x.NewStatus,
            x.EventType == IncidentEventType.Created ? "Report received." : $"Municipal operator recorded {Readable(x.NewStatus)}.", x.CreatedAtUtc)).ToList();
        return new PublicTracking(incident.Id, incident.Title,
            "Location recorded; exact address is available to municipal operators.", incident.Status,
            incident.CreatedAtUtc, incident.UpdatedAtUtc, progress);
    }

    public async Task<Incident> StatusAsync(Guid id, StatusRequest request, string actor, CancellationToken cancellationToken)
    {
        var incident = await RequireAsync(id, cancellationToken);
        var next = request.Status!.Value;
        var valid = (incident.Status, next) switch
        {
            (IncidentStatus.Reported, IncidentStatus.UnderReview) => true,
            (IncidentStatus.UnderReview, IncidentStatus.InProgress) => true,
            (IncidentStatus.InProgress, IncidentStatus.Resolved) => true,
            (IncidentStatus.Resolved, IncidentStatus.UnderReview) => true,
            _ => false
        };
        if (!valid) throw new IncidentWorkflowException(400, $"Cannot change {incident.Status} to {next}. Follow the incident lifecycle.");
        var note = Clean(request.Note);
        if (next == IncidentStatus.Resolved && (note?.Length ?? 0) < 10)
            throw new IncidentWorkflowException(400, "A resolution note describing the action taken is required (10–2000 characters).");
        var old = incident.Status;
        Touch(incident);
        incident.Status = next;
        incident.ResolvedAtUtc = next == IncidentStatus.Resolved ? incident.UpdatedAtUtc : null;
        AddEvent(incident, IncidentEventType.StatusChanged, old, next, note, actor, true);
        // EF commits the row update and event together in one transaction. A conflict or
        // event-insert failure rolls the entire SaveChanges operation back.
        await db.SaveChangesAsync(cancellationToken);
        return incident;
    }
    public async Task<Incident> PriorityAsync(Guid id, PriorityRequest request, string actor, CancellationToken cancellationToken)
    {
        var incident = await RequireAsync(id, cancellationToken);
        var next = request.Priority!.Value;
        if (next == incident.Priority) throw new IncidentWorkflowException(400, "The incident already has that priority.");
        var summary = $"Priority changed from {incident.Priority} to {next}.";
        incident.Priority = next;
        Touch(incident);
        AddEvent(incident, IncidentEventType.PriorityChanged, null, null, Combine(summary, request.Note), actor, false);
        await db.SaveChangesAsync(cancellationToken);
        return incident;
    }
    public async Task<Incident> AssignmentAsync(Guid id, AssignmentRequest request, string actor, CancellationToken cancellationToken)
    {
        var incident = await RequireAsync(id, cancellationToken);
        var next = Clean(request.AssignedTo);
        if (next == incident.AssignedTo) throw new IncidentWorkflowException(400, "The incident already has that assignment.");
        var summary = $"Assignment changed from {incident.AssignedTo ?? "Unassigned"} to {next ?? "Unassigned"}.";
        incident.AssignedTo = next;
        Touch(incident);
        AddEvent(incident, IncidentEventType.AssignmentChanged, null, null, Combine(summary, request.Note), actor, false);
        await db.SaveChangesAsync(cancellationToken);
        return incident;
    }
    public async Task<IncidentEvent> NoteAsync(Guid id, NoteRequest request, string actor, CancellationToken cancellationToken)
    {
        var incident = await RequireAsync(id, cancellationToken);
        var note = Clean(request.Note);
        if ((note?.Length ?? 0) < 3) throw new IncidentWorkflowException(400, "An internal note must contain at least 3 non-padding characters.");
        Touch(incident);
        var entry = AddEvent(incident, IncidentEventType.NoteAdded, null, null, note, actor, false);
        await db.SaveChangesAsync(cancellationToken);
        return entry;
    }
    private async Task<Incident> RequireAsync(Guid id, CancellationToken cancellationToken) =>
        await db.Incidents.SingleOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new IncidentWorkflowException(404, "No incident exists for this reference.");
    private IncidentEvent AddEvent(Incident incident, IncidentEventType type, IncidentStatus? oldStatus, IncidentStatus? newStatus, string? note, string actor, bool isPublic)
    {
        var entry = new IncidentEvent { IncidentId = incident.Id, EventType = type, OldStatus = oldStatus, NewStatus = newStatus,
            Note = note, ActorIdentifier = actor, IsPublic = isPublic, CreatedAtUtc = incident.UpdatedAtUtc };
        db.IncidentEvents.Add(entry);
        return entry;
    }
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static string Combine(string summary, string? note) => Clean(note) is { } text ? summary + " " + text : summary;
    private static DateTime UtcNow() => new(DateTime.UtcNow.Ticks / 10 * 10, DateTimeKind.Utc);
    private static void Touch(Incident incident) => incident.UpdatedAtUtc = new DateTime(Math.Max(UtcNow().Ticks, incident.UpdatedAtUtc.Ticks + 10), DateTimeKind.Utc);
    private static string Readable(IncidentStatus? status) => status switch { IncidentStatus.UnderReview => "Under Review", IncidentStatus.InProgress => "In Progress", _ => status.ToString() ?? "a status update" };
}
