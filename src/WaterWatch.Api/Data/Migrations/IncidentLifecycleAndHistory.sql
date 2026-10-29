START TRANSACTION;
ALTER TABLE "Incidents" ADD "AssignedTo" character varying(120);

ALTER TABLE "Incidents" ADD "Priority" character varying(20) NOT NULL DEFAULT 'Medium';

ALTER TABLE "Incidents" ADD "ResolvedAtUtc" timestamp with time zone;

ALTER TABLE "Incidents" ADD "UpdatedAtUtc" timestamp with time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP);

CREATE TABLE "IncidentEvents" (
    "Id" uuid NOT NULL,
    "IncidentId" uuid NOT NULL,
    "EventType" character varying(30) NOT NULL,
    "OldStatus" character varying(30),
    "NewStatus" character varying(30),
    "Note" character varying(2400),
    "ActorIdentifier" character varying(120) NOT NULL,
    "IsPublic" boolean NOT NULL,
    "CreatedAtUtc" timestamp with time zone NOT NULL,
    CONSTRAINT "PK_IncidentEvents" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_IncidentEvents_Incidents_IncidentId" FOREIGN KEY ("IncidentId") REFERENCES "Incidents" ("Id") ON DELETE RESTRICT
);

CREATE INDEX "IX_IncidentEvents_IncidentId_CreatedAtUtc_Id" ON "IncidentEvents" ("IncidentId", "CreatedAtUtc", "Id");

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

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261029222145_IncidentLifecycleAndHistory', '10.0.9');

COMMIT;
