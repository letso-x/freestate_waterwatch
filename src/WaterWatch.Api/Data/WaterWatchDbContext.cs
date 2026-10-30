using Microsoft.EntityFrameworkCore;
using WaterWatch.Api.Models;

namespace WaterWatch.Api.Data;

public sealed class WaterWatchDbContext(DbContextOptions<WaterWatchDbContext> options) : DbContext(options)
{
    public DbSet<Incident> Incidents => Set<Incident>();
    public DbSet<IncidentEvent> IncidentEvents => Set<IncidentEvent>();
    public DbSet<Sensor> Sensors => Set<Sensor>();
    public DbSet<TelemetryReading> TelemetryReadings => Set<TelemetryReading>();
    public DbSet<SensorAnomaly> SensorAnomalies => Set<SensorAnomaly>();
    public DbSet<IncidentAttachment> IncidentAttachments => Set<IncidentAttachment>();

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
        var sensor = modelBuilder.Entity<Sensor>();
        sensor.HasKey(x => x.Id);
        sensor.HasIndex(x => x.SensorKey).IsUnique();
        sensor.Property(x => x.SensorKey).HasMaxLength(64);
        sensor.Property(x => x.Name).HasMaxLength(120);
        sensor.Property(x => x.Location).HasMaxLength(300);
        sensor.Property(x => x.MeasurementType).HasMaxLength(64);
        sensor.Property(x => x.Unit).HasMaxLength(16);
        sensor.Property(x => x.Source).HasConversion<string>().HasMaxLength(16);
        sensor.Property(x => x.Direction).HasConversion<string>().HasMaxLength(16);
        sensor.Property(x => x.Version).IsConcurrencyToken();
        var reading = modelBuilder.Entity<TelemetryReading>();
        reading.HasKey(x => x.Id);
        reading.HasOne<Sensor>().WithMany().HasForeignKey(x => x.SensorId).OnDelete(DeleteBehavior.Restrict);
        reading.HasIndex(x => new { x.SensorId, x.MeasurementId }).IsUnique();
        reading.HasIndex(x => new { x.SensorId, x.MeasuredAtUtc });
        reading.Property(x => x.MeasurementType).HasMaxLength(64);
        reading.Property(x => x.Unit).HasMaxLength(16);
        reading.Property(x => x.Source).HasConversion<string>().HasMaxLength(16);
        var anomaly = modelBuilder.Entity<SensorAnomaly>();
        anomaly.HasKey(x => x.Id);
        anomaly.HasOne<Sensor>().WithMany().HasForeignKey(x => x.SensorId).OnDelete(DeleteBehavior.Restrict);
        anomaly.HasIndex(x => x.SensorId).IsUnique().HasFilter("\"RecoveredAtUtc\" IS NULL");
        anomaly.Property(x => x.Source).HasConversion<string>().HasMaxLength(16);
        anomaly.Property(x => x.Direction).HasConversion<string>().HasMaxLength(16);
        var attachment = modelBuilder.Entity<IncidentAttachment>();
        attachment.HasKey(x => x.Id);
        attachment.HasOne<Incident>().WithMany().HasForeignKey(x => x.IncidentId).OnDelete(DeleteBehavior.Restrict);
        attachment.Property(x => x.StoragePath).HasMaxLength(300).IsRequired();
        attachment.Property(x => x.OriginalFileName).HasMaxLength(255).IsRequired();
        attachment.Property(x => x.Sha256).HasMaxLength(64).IsRequired();
        attachment.Property(x => x.ContentType).HasMaxLength(32).IsRequired();
        attachment.Property(x => x.AttachmentType).HasConversion<string>().HasMaxLength(32).IsRequired();
        attachment.Property(x => x.UploadedBy).HasMaxLength(120).IsRequired();
        attachment.HasIndex(x => new { x.IncidentId, x.AttachmentType, x.CreatedAtUtc, x.Id });
    }
}
