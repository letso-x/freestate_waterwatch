START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261029235810_SensorTelemetry') THEN
    CREATE TABLE "Sensors" (
        "Id" uuid NOT NULL,
        "SensorKey" character varying(64) NOT NULL,
        "Name" character varying(120) NOT NULL,
        "Location" character varying(300) NOT NULL,
        "MeasurementType" character varying(64) NOT NULL,
        "Unit" character varying(16) NOT NULL,
        "Source" character varying(16) NOT NULL,
        "Baseline" double precision NOT NULL,
        "Threshold" double precision NOT NULL,
        "MinimumDeviation" double precision NOT NULL,
        "Direction" character varying(16) NOT NULL,
        "RequiredConsecutive" integer NOT NULL,
        "StaleAfterSeconds" integer NOT NULL,
        "ConsecutiveAbnormal" integer NOT NULL,
        "LastMeasuredAtUtc" timestamp with time zone,
        "LastReceivedAtUtc" timestamp with time zone,
        "LatestValue" double precision,
        "Version" uuid NOT NULL,
        "CreatedAtUtc" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_Sensors" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261029235810_SensorTelemetry') THEN
    CREATE TABLE "SensorAnomalies" (
        "Id" uuid NOT NULL,
        "SensorId" uuid NOT NULL,
        "StartedAtUtc" timestamp with time zone NOT NULL,
        "RecoveredAtUtc" timestamp with time zone,
        "TriggerValue" double precision NOT NULL,
        "Baseline" double precision NOT NULL,
        "Threshold" double precision NOT NULL,
        "MinimumDeviation" double precision NOT NULL,
        "Direction" character varying(16) NOT NULL,
        "ConsecutiveReadings" integer NOT NULL,
        "Source" character varying(16) NOT NULL,
        CONSTRAINT "PK_SensorAnomalies" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_SensorAnomalies_Sensors_SensorId" FOREIGN KEY ("SensorId") REFERENCES "Sensors" ("Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261029235810_SensorTelemetry') THEN
    CREATE TABLE "TelemetryReadings" (
        "Id" uuid NOT NULL,
        "SensorId" uuid NOT NULL,
        "MeasurementId" uuid NOT NULL,
        "MeasurementType" character varying(64) NOT NULL,
        "Value" double precision NOT NULL,
        "Unit" character varying(16) NOT NULL,
        "Source" character varying(16) NOT NULL,
        "MeasuredAtUtc" timestamp with time zone NOT NULL,
        "ReceivedAtUtc" timestamp with time zone NOT NULL,
        "IsAbnormal" boolean NOT NULL,
        CONSTRAINT "PK_TelemetryReadings" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_TelemetryReadings_Sensors_SensorId" FOREIGN KEY ("SensorId") REFERENCES "Sensors" ("Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261029235810_SensorTelemetry') THEN
    CREATE UNIQUE INDEX "IX_SensorAnomalies_SensorId" ON "SensorAnomalies" ("SensorId") WHERE "RecoveredAtUtc" IS NULL;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261029235810_SensorTelemetry') THEN
    CREATE UNIQUE INDEX "IX_Sensors_SensorKey" ON "Sensors" ("SensorKey");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261029235810_SensorTelemetry') THEN
    CREATE INDEX "IX_TelemetryReadings_SensorId_MeasuredAtUtc" ON "TelemetryReadings" ("SensorId", "MeasuredAtUtc");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261029235810_SensorTelemetry') THEN
    CREATE UNIQUE INDEX "IX_TelemetryReadings_SensorId_MeasurementId" ON "TelemetryReadings" ("SensorId", "MeasurementId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261029235810_SensorTelemetry') THEN
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
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261029235810_SensorTelemetry') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261029235810_SensorTelemetry', '10.0.9');
    END IF;
END $EF$;
COMMIT;
