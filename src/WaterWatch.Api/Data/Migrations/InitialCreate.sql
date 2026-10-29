CREATE TABLE IF NOT EXISTS "__EFMigrationsHistory" (
    "MigrationId" character varying(150) NOT NULL,
    "ProductVersion" character varying(32) NOT NULL,
    CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId")
);

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261029171144_InitialCreate') THEN
    CREATE TABLE "Incidents" (
        "Id" uuid NOT NULL,
        "Title" character varying(150) NOT NULL,
        "Description" character varying(2000) NOT NULL,
        "Location" character varying(300) NOT NULL,
        "Latitude" double precision,
        "Longitude" double precision,
        "Status" character varying(30) NOT NULL,
        "CreatedAtUtc" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_Incidents" PRIMARY KEY ("Id"),
        CONSTRAINT "CK_Incidents_Coordinates" CHECK (("Latitude" IS NULL) = ("Longitude" IS NULL)),
        CONSTRAINT "CK_Incidents_Latitude" CHECK ("Latitude" IS NULL OR "Latitude" BETWEEN -90 AND 90),
        CONSTRAINT "CK_Incidents_Longitude" CHECK ("Longitude" IS NULL OR "Longitude" BETWEEN -180 AND 180)
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261029171144_InitialCreate') THEN
    CREATE INDEX "IX_Incidents_CreatedAtUtc_Id" ON "Incidents" ("CreatedAtUtc", "Id");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261029171144_InitialCreate') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261029171144_InitialCreate', '10.0.9');
    END IF;
END $EF$;
COMMIT;

