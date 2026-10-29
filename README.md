# WaterWatch Free State

A municipal incident dashboard built with React, Vite, TypeScript and Tailwind CSS, backed by the existing ASP.NET Core (.NET 10), EF Core and PostgreSQL API. The API request path remains Controller → IncidentService → WaterWatchDbContext. Authentication, WhatsApp, IoT, media uploads, incident assignment and status updates are outside the current scope. Resident reporting now includes map/GPS coordinate selection.


## Start both applications (Task 2)

The existing database migration is unchanged. Do not recreate the database or add another migration for the dashboard.

**Terminal 1 — API**, from the repository root:

```powershell
# Reuse the Windows user variable configured during Task 1; never print its value.
if (-not $env:ConnectionStrings__WaterWatch) {
    $env:ConnectionStrings__WaterWatch = [Environment]::GetEnvironmentVariable('ConnectionStrings__WaterWatch', 'User')
}
dotnet run --project src/WaterWatch.Api --launch-profile http
```

API: http://localhost:5100 · Swagger: http://localhost:5100/swagger/index.html

**Terminal 2 — frontend**, from the repository root:

```powershell
cd frontend
npm ci
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm run dev
```

Dashboard: http://localhost:5173

`frontend/.env.local` contains `VITE_API_BASE_URL=http://localhost:5100`. Change it to the API origin when needed, then restart Vite. All `VITE_` variables are public browser configuration: never put passwords, Supabase secrets or database connection strings in them. The browser talks only to the API; only the API talks to PostgreSQL. `.env.local`, dependencies and build output are ignored by Git.

Vite uses port 5173 with `strictPort` enabled: it fails clearly if that port is occupied instead of silently selecting a port rejected by CORS. In Development, the API explicitly allows `http://localhost:5173` and `http://127.0.0.1:5173`; it permits GET/POST and required request headers without credentialed CORS or wildcard origins. Other environments have no allowed origins unless configured via `Cors:AllowedOrigins` (for example `Cors__AllowedOrigins__0=https://your-dashboard.example`). CORS is not authentication. Keep this unauthenticated MVP in the intended development/demo environment.

## Current public and municipal experiences

The existing dashboard and API were extended, not restarted. See [Task 2 revision details](docs/TASK2_REVISION.md) for scope, branding references, location behavior and remaining backend requirements.

- Residents: `/report`, `/report/success` and `/track`. Report independently, retain a full UUID reference and look up the stored report.
- Municipal personnel: `/operations` and `/operations/incidents/:id`. Monitor, search, filter and review real reports. Public submission was moved out of this workspace.
- Shared prototype design tokens use Mangaung-inspired green/orange/charcoal. Their HEX values are prototype choices, not verified official values. Both workspaces display Hackathon Prototype and no-endorsement notices.
- Map pins, keyboard map-centre selection, manual coordinates and permission-based GPS use the existing coordinate fields. Photos are explicitly unavailable pending attachment endpoints, object storage and a future attachment migration.
- A minimal read-only GET `/api/incidents/{id}` supports tracking and details without downloading the incident list. Existing list/POST contracts and migrations remain unchanged.
- Routes separate the user experiences, not access permissions. The prototype has no authentication. Static hosting needs SPA fallback to `/index.html` for direct route loads.

## Task 2 build and test commands

```powershell
# Repository root; stop a running API first to avoid a Windows executable lock.
dotnet build WaterWatch.slnx --no-restore
$env:WATERWATCH_TEST_POSTGRES = $env:ConnectionStrings__WaterWatch
dotnet test WaterWatch.slnx --no-build --no-restore

# Frontend
cd frontend
npm run build
npm test
```

Initial restore/setup is documented below. `npm ci` installs the committed lockfile. Verification used .NET SDK 10.0.401, Node 25.9.0 and npm 11.12.1. The test tools are pinned to versions compatible with the installed Node runtime.
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

## Previous Task 2 baseline verification on 29 October 2026

- `dotnet build WaterWatch.slnx --no-restore`: passed, 0 warnings, 0 errors.
- Backend tests with the saved Supabase connection: 19 passed, 0 failed, 0 skipped. This includes all 14 existing tests and 5 CORS checks.
- `npm run build`: TypeScript check and Vite production build passed.
- `npm test`: 16 tests passed across 3 files, covering loading/empty/error states, filtering, form validation, successful submission and refresh, failed submission, API pagination and server validation errors.
- Live HTTP: frontend 200, GET incidents 200, POST incident 201, allowed-origin preflight 204. Allowed-origin responses included `Access-Control-Allow-Origin: http://localhost:5173`; an unlisted origin received no allow-origin header.
- Full process restart: stopped both API and Vite, restarted both, then retrieved the same Supabase incident UUID created before shutdown. The temporary verification row was removed after the check.
- No PostgreSQL migration, model, controller contract or database provider changes were made.
- **Browser QA limitation:** the in-app browser bridge timed out. Windows Computer Use then stopped because it could not determine Chrome's current URL reliably enough to enforce its browser policy. Actual browser form submission, visual/mobile inspection and browser-console CORS checks remain unverified. Passing HTTP CORS checks and jsdom interaction tests do not substitute for those browser checks. To complete manual QA, open http://localhost:5173, submit a report, confirm it appears, test search/status filtering, resize to a mobile width, and inspect DevTools Console for CORS errors.

## Current Task 2 revision verification — 29 October 2026

The split resident/operations implementation builds successfully. Backend: 21 passed, 0 failed, 0 skipped (including existing Supabase tests); frontend: 32 passed, 0 failed. Backend build: 0 warnings, 0 errors. Frontend TypeScript/Vite build: passed. Direct loading of all five React routes returned 200 SPA documents; live lookup/preflight CORS checks passed. Database model and migrations are unchanged.

See [revision scope and verification](docs/TASK2_REVISION.md) for the remaining photo backend requirements, unsupported management features and browser/device QA limits. The browser webview failed to attach, so physical GPS, visual/mobile rendering and browser-console checks remain unverified.
