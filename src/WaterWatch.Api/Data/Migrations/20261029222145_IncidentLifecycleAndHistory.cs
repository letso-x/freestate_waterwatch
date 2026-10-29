using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaterWatch.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class IncidentLifecycleAndHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AssignedTo",
                table: "Incidents",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Priority",
                table: "Incidents",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Medium");

            migrationBuilder.AddColumn<DateTime>(
                name: "ResolvedAtUtc",
                table: "Incidents",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAtUtc",
                table: "Incidents",
                type: "timestamp with time zone",
                nullable: false,
                defaultValueSql: "CURRENT_TIMESTAMP");

            migrationBuilder.CreateTable(
                name: "IncidentEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    IncidentId = table.Column<Guid>(type: "uuid", nullable: false),
                    EventType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    OldStatus = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    NewStatus = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    Note = table.Column<string>(type: "character varying(2400)", maxLength: 2400, nullable: true),
                    ActorIdentifier = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    IsPublic = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IncidentEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_IncidentEvents_Incidents_IncidentId",
                        column: x => x.IncidentId,
                        principalTable: "Incidents",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_IncidentEvents_IncidentId_CreatedAtUtc_Id",
                table: "IncidentEvents",
                columns: new[] { "IncidentId", "CreatedAtUtc", "Id" });

            migrationBuilder.Sql("""
                UPDATE "Incidents" SET "UpdatedAtUtc" = "CreatedAtUtc";
                INSERT INTO "IncidentEvents" ("Id", "IncidentId", "EventType", "OldStatus", "NewStatus", "Note", "ActorIdentifier", "IsPublic", "CreatedAtUtc")
                SELECT "Id", "Id", 'Created', NULL, "Status", NULL, 'legacy-import', TRUE, "CreatedAtUtc" FROM "Incidents";
                CREATE FUNCTION waterwatch_preserve_incident_history() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    RAISE EXCEPTION 'Incident history is append-only.';
                END;
                $$;
                CREATE TRIGGER incident_history_append_only BEFORE UPDATE OR DELETE ON "IncidentEvents"
                    FOR EACH ROW EXECUTE FUNCTION waterwatch_preserve_incident_history();
                ALTER TABLE "Incidents" ENABLE ROW LEVEL SECURITY;
                ALTER TABLE "IncidentEvents" ENABLE ROW LEVEL SECURITY;
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                        REVOKE ALL ON "Incidents", "IncidentEvents" FROM anon;
                    END IF;
                    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                        REVOKE ALL ON "Incidents", "IncidentEvents" FROM authenticated;
                    END IF;
                END;
                $$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER incident_history_append_only ON \"IncidentEvents\"; DROP FUNCTION waterwatch_preserve_incident_history();");
            migrationBuilder.DropTable(
                name: "IncidentEvents");

            migrationBuilder.DropColumn(
                name: "AssignedTo",
                table: "Incidents");

            migrationBuilder.DropColumn(
                name: "Priority",
                table: "Incidents");

            migrationBuilder.DropColumn(
                name: "ResolvedAtUtc",
                table: "Incidents");

            migrationBuilder.DropColumn(
                name: "UpdatedAtUtc",
                table: "Incidents");
        }
    }
}
