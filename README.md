# WaterWatch Free State — Task 1 API

ASP.NET Core (.NET 10), EF Core and PostgreSQL incident API. The request path is Controller → IncidentService → WaterWatchDbContext. No frontend, authentication, WhatsApp or IoT integration is included.

## Prerequisites

- .NET 10 SDK and access to NuGet for the initial restore.
- A PostgreSQL database (Supabase recommended), with credentials allowed to create tables and apply migrations.
- For Supabase, create a project and wait until ready. In **Connect → Session pooler**, copy the host, port, database and username. Session mode on port 5432 supports IPv4. Use the project's database password, not its public API key. See https://supabase.com/docs/guides/database/connecting-to-postgres.

## Configuration

Set `ConnectionStrings__WaterWatch` as an environment variable. Example format (replace all placeholders):

```text
Host=YOUR_POOLER_HOST;Port=5432;Database=postgres;Username=postgres.YOUR_PROJECT_REF;Password="YOUR_DATABASE_PASSWORD";SSL Mode=Require
```

On Windows, use **Edit environment variables for your account → User variables → New**, then restart the terminal or Codex so it inherits the value. Alternatively, set `$env:ConnectionStrings__WaterWatch` in the same PowerShell session used for the commands below. Never commit credentials. `.env.example` documents the format; ASP.NET Core does not automatically load `.env` files. For certificate verification, use `SSL Mode=VerifyFull` and the Supabase CA via `Root Certificate` as described in Supabase's connection guide. No database credentials are stored in this repository.

## Restore, migrate and run

From the repository root:

```powershell
dotnet restore WaterWatch.slnx
dotnet tool restore
dotnet build WaterWatch.slnx --no-restore
dotnet ef database update --project src/WaterWatch.Api
dotnet run --project src/WaterWatch.Api --launch-profile http
```

Migration application is explicit; the API does not change the database on startup. The checked-in initial migration creates `Incidents`, coordinate constraints, an ordering index and EF migration history. Do not create tables manually. The API fails fast with a setup message if the connection variable is absent.

Open http://localhost:5100/swagger in Development. Expand **POST /api/incidents**, click **Try it out**, and submit:

```json
{
  "title": "Burst water pipe",
  "description": "Water is flowing continuously from a damaged pipe.",
  "location": "Nelson Mandela Drive, Bloemfontein",
  "latitude": -29.12,
  "longitude": 26.21
}
```

A successful POST returns **201** and the saved incident, including its UUID, `Reported` status and UTC creation timestamp. Confirm the row in Supabase's Table Editor (`public.Incidents`), then call **GET /api/incidents** to retrieve it. Swagger is enabled only in Development; this MVP has no authentication and should be run locally for the demo.

## Contract and errors

- `title`: required, 3–150 characters.
- `description`: required, 10–2000 characters.
- `location`: required, 3–300 characters.
- Text is trimmed; the minimum length must still hold after trimming.
- Coordinates are optional, but must be supplied together. Latitude is -90…90; longitude is -180…180.
- ID, status and creation timestamp are assigned by the server.
- GET returns a JSON array, newest first with UUID as a stable tie breaker. `page` defaults to 1 (maximum 1,000,000), `pageSize` defaults to 50 (maximum 100). An empty page returns `[]`.
- Invalid input or malformed JSON returns **400 ValidationProblemDetails**. Database failure returns **503 ProblemDetails**; unexpected failures return **500 ProblemDetails**. Responses do not expose exception details or credentials.

Example requests are also in `src/WaterWatch.Api/WaterWatch.Api.http`.

## Tests

```powershell
dotnet test WaterWatch.slnx --no-restore
```

HTTP integration tests use an isolated SQLite database per test to verify validation, persistence through separate EF scopes, retrieval, pagination and Swagger. An unreachable PostgreSQL test checks sanitized 503 responses. These tests do not prove Supabase connectivity or Npgsql persistence.

For the live PostgreSQL persistence test, first apply the migration to a development/test database, then explicitly opt in:

```powershell
$env:WATERWATCH_TEST_POSTGRES = $env:ConnectionStrings__WaterWatch
dotnet test WaterWatch.slnx --filter FullyQualifiedName~PostgresPersistenceTests
```

The live test inserts one temporary incident, verifies its committed row and API retrieval, then deletes only that incident. Without `WATERWATCH_TEST_POSTGRES`, the test is reported as skipped. It never resets or recreates the database. Network access to Supabase and valid database credentials remain external requirements.

## Verification on 29 October 2026

- `dotnet build WaterWatch.slnx --no-restore`: succeeded, 0 warnings, 0 errors.
- `dotnet test WaterWatch.slnx --no-build --no-restore`: 14 passed, 0 failed, 0 skipped, including live Supabase persistence.
- `dotnet ef migrations has-pending-model-changes --project src/WaterWatch.Api --no-build`: no pending model changes.
- Generated an idempotent PostgreSQL script at `src/WaterWatch.Api/Data/Migrations/InitialCreate.sql`.
- Applied `20261029171144_InitialCreate` successfully to Supabase. The live test created an incident through POST, verified the committed PostgreSQL row through a separate EF scope, retrieved it through GET, and cleaned up the temporary report. Credentials were read from the Windows user environment without being printed or written to the repository.
