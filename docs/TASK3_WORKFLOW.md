# Task 3 — Incident management, repair workflow and audit trail

## What changed

Task 2 commit `42102ce` was retained. The existing controller/service/DbContext architecture, PostgreSQL database, report/map/GPS flows, layouts, design tokens, validation, search and summaries remain. No WhatsApp, IoT, telemetry, AI, uploads, notifications or contractor accounts were added.

`Incident` now includes `UpdatedAtUtc`, nullable `ResolvedAtUtc`, priority (default Medium), and nullable assignment. New `IncidentEvent` records store ID, incident FK, type, old/new status, note, server-derived actor, public visibility and UTC timestamp. Notes accept up to 2,000 user characters; the stored event field allows 2,400 to include a generated priority/assignment change summary.

The normal lifecycle is Reported → UnderReview → InProgress → Resolved. Only Resolved → UnderReview reopens a report, clearing the current resolution timestamp while retaining the earlier resolution event. Resolution requires a trimmed 10–2,000 character action note. Assignment and priority never change status automatically. Notes are internal by default and clients cannot set the actor or visibility.

Each management mutation updates the incident and adds its event in one `SaveChangesAsync` call. EF Core's relational transaction commits both or rolls both back. `UpdatedAtUtc` is a concurrency token: competing stale writes return 409 rather than silently overwriting changes. The UI retains failed input and directs the operator to reload on conflict. Timestamps use UTC with PostgreSQL microsecond precision and are displayed in SAST.

## Incremental migration

`20261029222145_IncidentLifecycleAndHistory` adds the new columns, `IncidentEvents`, its FK and ordering index. Existing IDs, descriptions, addresses, coordinates and creation timestamps remain intact. Existing rows receive Medium priority, no assignment/resolution, UpdatedAtUtc equal to CreatedAtUtc, and an initial imported Created event. Original migration files are unchanged.

Application saves reject event edits/deletes. A PostgreSQL trigger also rejects direct UPDATE/DELETE on `IncidentEvents`; the incident FK prevents deleting an incident and losing its history. This is an append-only application audit trail, not a tamper-proof ledger against database administrators capable of altering the schema.

Both tables have RLS enabled, with no public policies, and grants revoked from Supabase `anon` / `authenticated` roles. This closes the direct Supabase REST path to private operational data. The demo API uses the existing server-side owner connection, which can access the tables. Do not put database owner credentials or Supabase service-role credentials in the browser. A future dedicated database role needs explicit server-only permissions/policies.

The new SQL script is for review; use EF migration history through `dotnet ef database update` to apply migrations. Do not replay the SQL against an already migrated database. Migration rollback is not part of the demo; it would remove the new history table and deliberately does not reopen anonymous grants.

## API contracts and access

| Endpoint | Access | Result |
| --- | --- | --- |
| POST `/api/incidents` | Public | Existing citizen reporting contract; creates the incident and initial event atomically. |
| GET `/api/incidents` | Operator | Existing paginated operational records. |
| GET `/api/incidents/{id}` | Operator | Full operational details. |
| PATCH `/api/incidents/{id}/status` | Operator | `{status,note}`; valid transition only; resolution note required. |
| PATCH `/api/incidents/{id}/priority` | Operator | `{priority,note}`; Low/Medium/High/Critical. |
| PATCH `/api/incidents/{id}/assignment` | Operator | `{assignedTo,note}`; null/blank clears assignment without changing status. |
| POST `/api/incidents/{id}/notes` | Operator | `{note}`; appends an internal note. |
| GET `/api/incidents/{id}/events` | Operator | Full append-only timeline including notes and actor identifiers. |
| GET `/api/public/incidents/{id}/tracking` | Public | Explicit public-safe tracking DTO. |

Privileged requests require `Authorization: Bearer <demo-operator-token>`. Missing/invalid keys return 401. Invalid JSON/enum values, transitions, no-op priority/assignment changes and inadequate resolution notes return 400. Missing records return 404; concurrency conflicts return 409; unavailable storage returns 503. Sensitive API responses use `Cache-Control: no-store`.

Operational list/details were intentionally changed from anonymous to authenticated reads; otherwise staff assignment and private data could leak through the old GET endpoints. The public React confirmation/tracking pages now use the new public endpoint and never download the operational list.

Public tracking returns only ID/reference, submitted title, a conservative location description, current status, reported/updated timestamps, and public status-event metadata with server-generated summaries. Exact free-text addresses and coordinates remain in operations because they could include identifying information. Public responses exclude descriptions, priority, assignment, actor identifiers, resolution notes and investigation notes. Even a status event marked public exposes only its progress metadata; its raw operator note is never projected. This protection is enforced by the backend DTO, not just React rendering.

## Operator security and demo setup

A small ASP.NET authentication handler validates a server-configured random token using constant-time comparison of SHA-256 hashes. It creates the Operator role and actor identity from server configuration. A missing/weak key fails closed. There is no anonymous management bypass. CORS explicitly allows the two existing Vite development origins and GET/POST/PATCH, including the authorization header; CORS is not authentication.

This is one shared local demo operator, not a user-management system. All activity is attributed to the configured `Operator__Identifier` (default demo-operator), not independently authenticated individual employees. Replace the scheme with managed individual identity/roles before real deployment. Authentication requires HTTPS outside Development; demo launch settings bind localhost. Keep this demonstration local.

From the repository root in PowerShell:

```powershell
# Create a 256-bit key in the Windows user environment without printing it.
./scripts/Initialize-DemoOperator.ps1

# Existing database connection is already saved as ConnectionStrings__WaterWatch.
$env:ConnectionStrings__WaterWatch = [Environment]::GetEnvironmentVariable('ConnectionStrings__WaterWatch', 'User')
dotnet tool restore
dotnet ef database update --project src/WaterWatch.Api

# Terminal 1: imports saved settings without printing credentials, then starts the API.
./scripts/Start-Api.ps1
```

Terminal 2:

```powershell
cd frontend
npm ci
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm run dev
```

The resident portal is http://localhost:5173/report; tracking is `/track`. Open http://localhost:5173/operations to sign in. To reveal the token **locally for copying into the operator password field**, run in another terminal:

```powershell
./scripts/Initialize-DemoOperator.ps1 -RevealToken
```

Do not paste it into chat, commit it, put it in a `VITE_` variable or save it in browser storage. React holds the entered token in memory and sends it only on privileged requests. Sign out/reload clears it. The setup script reuses a previously generated key; key changes require restarting the API and signing in again.

## User interface

- Existing operations search, status filters and summaries remain. The list adds all four readable status labels, priority/priority filtering, assigned team and last-updated timestamp.
- Detail pages show the recorded map when coordinates exist, full incident information and valid next-status actions. Resolution text is mandatory, and reopening is explicit.
- Separate forms update assignment/priority and append private notes. They disable repeated submission while saving, show actual API errors, retain failed input and confirm successful saves.
- The private activity timeline shows status transitions, priorities, assignments, notes, actor identifiers, visibility and timestamps.
- Resident confirmation/tracking use public-safe data and a separate public timeline. Resolved is labelled as a municipal operator-recorded outcome, not independent verification of a physical repair.
- The Mangaung-inspired prototype palette, mobile layouts and Hackathon Prototype/no-endorsement notice remain. Photo support is still explicitly unavailable.

## Reproducible persisted demonstration

With both apps running, the script below drives the real HTTP API and Supabase. It creates one clearly labelled hackathon demonstration report, not a claimed real-world leak. It records a Bloemfontein map coordinate pair, moves through review/work/resolution, assigns a team, adds a private investigation note, sets priority and verifies that the public timeline excludes private information. It also checks unauthorized history access is rejected and the frontend serves the report route.

```powershell
./scripts/Verify-Workflow.ps1
```

It prints the full reference and stores only demonstration metadata (never credentials) under the OS temporary directory. Open `/track` with that reference, or enter operations with the demo token to review the same stored record. The demo report and audit history intentionally remain available.

Stop both app terminals with Ctrl+C, restart them using the commands above, then run:

```powershell
./scripts/Verify-Workflow.ps1 -VerifyOnly
```

This checks the same UUID, resolution, priority, assignment, updated timestamp and exact saved event IDs after actual process restart. Browser-driven clicking, physical GPS, visual/mobile rendering and console CORS inspection are separate verification tasks; HTTP success must not be described as a browser test.

## Build and test commands

Stop the API before building on Windows to avoid locking its executable.

```powershell
dotnet build WaterWatch.slnx --no-restore
$env:WATERWATCH_TEST_POSTGRES = [Environment]::GetEnvironmentVariable('ConnectionStrings__WaterWatch', 'User')
dotnet test WaterWatch.slnx --no-build --no-restore
npm --prefix frontend run build
npm --prefix frontend test
```

Existing regressions remain, with test operator authorization for private reads and public tracking fixtures migrated to the safe DTO. New tests cover transitions, resolution/reopening, validation, private/public visibility, spoofed event metadata, unauthorized access, rollback, stale-write conflicts, immutable history, operator access controls and UI workflow. Live PostgreSQL tests use a shared test transaction and roll it back; committed audit events are never deleted for test cleanup. The application restart demonstration separately verifies committed persistence.

## Actual verification — 30 October 2026

- Backend build: `dotnet build WaterWatch.slnx --no-restore` succeeded with **0 warnings, 0 errors**.
- Frontend build: `npm --prefix frontend run build` passed TypeScript and Vite production checks. Vite emitted a plugin-timing advisory, not a build failure.
- Full backend suite with Supabase enabled: **48 passed, 0 failed, 0 skipped**. Includes the existing regressions, actual PostgreSQL workflow/trigger checks, rollback, concurrency, privacy and authorization.
- Full frontend suite: **43 passed, 0 failed** across six files. Includes existing report/map/tracking regressions and new operator access, management and public privacy tests.
- Migration: `20261029222145_IncidentLifecycleAndHistory` applied successfully to the existing Supabase database. EF reported no pending model changes. Original migration sources and original SQL were unchanged.
- Real HTTP/Supabase demonstration succeeded with reference **f66f7168-89f2-4c44-b2e1-5fb5236b7bc6**: Resolved, High priority, Maintenance Team A (demo), seven operational events and four public progress events. Private notes/assignment/actor data were absent from the public response; anonymous history access returned 401.
- Stopped both the API and Vite, restarted both, and ran `Verify-Workflow.ps1 -VerifyOnly`. The same UUID, resolution, priority, assignment, updated timestamp and exact saved event IDs persisted. Frontend returned 200. No incident data was recreated for this check.
- Live PATCH preflight after restart returned 204, allowed `http://localhost:5173`, and advertised GET/POST/PATCH.
- **Browser/device QA remains incomplete:** the browser-use webview timed out while attaching to the report page. The end-to-end demo above is explicitly HTTP-driven. Browser-driven clicking, operator sign-in, physical GPS, visual/mobile inspection and browser-console CORS checks were not verified. Automated React tests and HTTP tests do not replace those browser checks.

The labelled demonstration report and its audit history remain in PostgreSQL for review; automated test data was rolled back. This is a working local hackathon workflow with a shared operator credential, not production identity management or independent confirmation of a physical repair. Photo uploads, individual operator accounts, notifications, AI, IoT and WhatsApp remain unimplemented by design.
