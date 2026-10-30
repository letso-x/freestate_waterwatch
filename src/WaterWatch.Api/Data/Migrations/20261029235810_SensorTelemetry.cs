using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaterWatch.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class SensorTelemetry : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Sensors",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SensorKey = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Location = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    MeasurementType = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Unit = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Source = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Baseline = table.Column<double>(type: "double precision", nullable: false),
                    Threshold = table.Column<double>(type: "double precision", nullable: false),
                    MinimumDeviation = table.Column<double>(type: "double precision", nullable: false),
                    Direction = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    RequiredConsecutive = table.Column<int>(type: "integer", nullable: false),
                    StaleAfterSeconds = table.Column<int>(type: "integer", nullable: false),
                    ConsecutiveAbnormal = table.Column<int>(type: "integer", nullable: false),
                    LastMeasuredAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastReceivedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LatestValue = table.Column<double>(type: "double precision", nullable: true),
                    Version = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Sensors", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SensorAnomalies",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SensorId = table.Column<Guid>(type: "uuid", nullable: false),
                    StartedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    RecoveredAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    TriggerValue = table.Column<double>(type: "double precision", nullable: false),
                    Baseline = table.Column<double>(type: "double precision", nullable: false),
                    Threshold = table.Column<double>(type: "double precision", nullable: false),
                    MinimumDeviation = table.Column<double>(type: "double precision", nullable: false),
                    Direction = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    ConsecutiveReadings = table.Column<int>(type: "integer", nullable: false),
                    Source = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SensorAnomalies", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SensorAnomalies_Sensors_SensorId",
                        column: x => x.SensorId,
                        principalTable: "Sensors",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TelemetryReadings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SensorId = table.Column<Guid>(type: "uuid", nullable: false),
                    MeasurementId = table.Column<Guid>(type: "uuid", nullable: false),
                    MeasurementType = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Value = table.Column<double>(type: "double precision", nullable: false),
                    Unit = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Source = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    MeasuredAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ReceivedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsAbnormal = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TelemetryReadings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TelemetryReadings_Sensors_SensorId",
                        column: x => x.SensorId,
                        principalTable: "Sensors",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SensorAnomalies_SensorId",
                table: "SensorAnomalies",
                column: "SensorId",
                unique: true,
                filter: "\"RecoveredAtUtc\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Sensors_SensorKey",
                table: "Sensors",
                column: "SensorKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TelemetryReadings_SensorId_MeasuredAtUtc",
                table: "TelemetryReadings",
                columns: new[] { "SensorId", "MeasuredAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_TelemetryReadings_SensorId_MeasurementId",
                table: "TelemetryReadings",
                columns: new[] { "SensorId", "MeasurementId" },
                unique: true);
            migrationBuilder.Sql("""
                ALTER TABLE "Sensors" ENABLE ROW LEVEL SECURITY;
                ALTER TABLE "TelemetryReadings" ENABLE ROW LEVEL SECURITY;
                ALTER TABLE "SensorAnomalies" ENABLE ROW LEVEL SECURITY;
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                        REVOKE ALL ON "Sensors", "TelemetryReadings", "SensorAnomalies" FROM anon;
                    END IF;
                    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                        REVOKE ALL ON "Sensors", "TelemetryReadings", "SensorAnomalies" FROM authenticated;
                    END IF;
                END;
                $$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SensorAnomalies");

            migrationBuilder.DropTable(
                name: "TelemetryReadings");

            migrationBuilder.DropTable(
                name: "Sensors");
        }
    }
}
