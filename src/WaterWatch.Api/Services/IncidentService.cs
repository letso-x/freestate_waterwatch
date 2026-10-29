using Microsoft.EntityFrameworkCore;
using WaterWatch.Api.Contracts;
using WaterWatch.Api.Data;
using WaterWatch.Api.Models;

namespace WaterWatch.Api.Services;

public sealed class IncidentService(WaterWatchDbContext db)
{
    public async Task<Incident> CreateAsync(CreateIncidentRequest request, CancellationToken cancellationToken)
    {
        var incident = new Incident
        {
            Title = request.Title.Trim(), Description = request.Description.Trim(),
            Location = request.Location.Trim(), Latitude = request.Latitude, Longitude = request.Longitude
        };
        db.Incidents.Add(incident);
        await db.SaveChangesAsync(cancellationToken);
        return incident;
    }
    public Task<List<Incident>> GetAsync(int page, int pageSize, CancellationToken cancellationToken) =>
        db.Incidents.AsNoTracking().OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(cancellationToken);
}
