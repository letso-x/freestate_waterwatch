using Microsoft.EntityFrameworkCore;
using WaterWatch.Api.Models;

namespace WaterWatch.Api.Data;

public sealed class WaterWatchDbContext(DbContextOptions<WaterWatchDbContext> options) : DbContext(options)
{
    public DbSet<Incident> Incidents => Set<Incident>();
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var incident = modelBuilder.Entity<Incident>();
        incident.ToTable("Incidents", table =>
        {
            table.HasCheckConstraint("CK_Incidents_Latitude", "\"Latitude\" IS NULL OR \"Latitude\" BETWEEN -90 AND 90");
            table.HasCheckConstraint("CK_Incidents_Longitude", "\"Longitude\" IS NULL OR \"Longitude\" BETWEEN -180 AND 180");
            table.HasCheckConstraint("CK_Incidents_Coordinates", "(\"Latitude\" IS NULL) = (\"Longitude\" IS NULL)");
        });
        incident.HasKey(x => x.Id);
        incident.Property(x => x.Title).HasMaxLength(150).IsRequired();
        incident.Property(x => x.Description).HasMaxLength(2000).IsRequired();
        incident.Property(x => x.Location).HasMaxLength(300).IsRequired();
        incident.Property(x => x.Status).HasConversion<string>().HasMaxLength(30).IsRequired();
        incident.HasIndex(x => new { x.CreatedAtUtc, x.Id });
    }
}
