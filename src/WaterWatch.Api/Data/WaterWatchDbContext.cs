using Microsoft.EntityFrameworkCore;
using WaterWatch.Api.Models;

namespace WaterWatch.Api.Data;

public sealed class WaterWatchDbContext(DbContextOptions<WaterWatchDbContext> options) : DbContext(options)
{
    public DbSet<Incident> Incidents => Set<Incident>();
    public DbSet<IncidentEvent> IncidentEvents => Set<IncidentEvent>();

    private void EnforceAppendOnlyHistory()
    {
        if (ChangeTracker.Entries<IncidentEvent>().Any(entry => entry.State is EntityState.Modified or EntityState.Deleted))
            throw new InvalidOperationException("Incident history is append-only.");
    }
    public override int SaveChanges(bool acceptAllChangesOnSuccess) { EnforceAppendOnlyHistory(); return base.SaveChanges(acceptAllChangesOnSuccess); }
    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    { EnforceAppendOnlyHistory(); return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken); }

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
        incident.Property(x => x.UpdatedAtUtc).IsConcurrencyToken().HasDefaultValueSql("CURRENT_TIMESTAMP");
        incident.Property(x => x.Priority).HasConversion<string>().HasMaxLength(20).HasDefaultValue(IncidentPriority.Medium).HasSentinel(IncidentPriority.Medium);
        incident.Property(x => x.AssignedTo).HasMaxLength(120);
        incident.HasIndex(x => new { x.CreatedAtUtc, x.Id });
        var history = modelBuilder.Entity<IncidentEvent>();
        history.HasKey(x => x.Id);
        history.HasOne<Incident>().WithMany().HasForeignKey(x => x.IncidentId).OnDelete(DeleteBehavior.Restrict);
        history.Property(x => x.EventType).HasConversion<string>().HasMaxLength(30);
        history.Property(x => x.OldStatus).HasConversion<string>().HasMaxLength(30);
        history.Property(x => x.NewStatus).HasConversion<string>().HasMaxLength(30);
        history.Property(x => x.Note).HasMaxLength(2400);
        history.Property(x => x.ActorIdentifier).HasMaxLength(120).IsRequired();
        history.HasIndex(x => new { x.IncidentId, x.CreatedAtUtc, x.Id });
    }
}
