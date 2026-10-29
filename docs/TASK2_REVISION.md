# Task 2 revision: separate reporting and operations

Historical Task 2 snapshot at commit 42102ce. [Task 3](TASK3_WORKFLOW.md) adds operator authorization, lifecycle management and public-safe tracking; its security and API contracts supersede the access limitations described below.

## Preserved implementation

The existing React dashboard, incident summaries, search/status filtering, timestamps, validation rules, paginated API client, error handling, explicit CORS allowlist, ASP.NET Controller → Service → DbContext architecture, PostgreSQL provider and migrations were retained. The original dashboard was moved to `frontend/src/pages/OperationsDashboard.tsx`; its reporting component was reused as a page form rather than discarded.

## Routes and working features

| Route | Audience | Behavior |
| --- | --- | --- |
| `/` | All | Redirects to `/report`. |
| `/report` | Residents | Independently submits title, address/location, description and optional coordinate pair through existing POST `/api/incidents`. |
| `/report/success?reference=<uuid>` | Residents | Verifies a saved record and displays the full server-issued UUID as the reference. A direct visit without a reference never fabricates success. |
| `/track` | Residents | Accepts a full reference and retrieves only that record. Also supports `?reference=<uuid>` for direct links. |
| `/operations` | Municipal personnel | Existing real incident summaries, search, status filtering, refresh, loading/empty/error states and links to details. Public submission actions were removed from this workspace. |
| `/operations/incidents/:id` | Municipal personnel | Read-only full report review, address, status, timestamp, source, full reference and saved coordinates. |

One small read-only endpoint, GET `/api/incidents/{id}`, was added using the existing controller/service structure. It returns 200 for an existing record and 404 otherwise. GET list and POST behavior remain intact. This lookup prevents the resident tracking UI from downloading all reports just to find one reference. It is not an access-control mechanism: the existing prototype API and operations routes remain unauthenticated.

The full UUID is the canonical reference; shortened labels are not accepted for tracking. Confirmation uses the POST-issued UUID in a refreshable URL and GET lookup, not a client-generated receipt or local-only incident storage. If lookup fails after POST, the page retains the reference and offers lookup retry, without offering duplicate submission.

## Location selection

- Leaflet provides an interactive map, zoom/pan controls and click/tap selection. The initial Bloemfontein map view is not saved as an incident location unless explicitly selected.
- Keyboard users can pan the focused map with arrow keys and use **Select map centre**. Manual latitude/longitude fields provide an alternative.
- **Use my current location** calls browser geolocation only after a click. The browser controls permission; denial, unavailable GPS and timeout have address/map fallbacks. Pending GPS temporarily disables submission.
- A selected coordinate pair is validated and saved through the latitude/longitude fields already supported by Task 1. No location migration was needed.
- Coordinates remain optional for this sprint so a tile outage, denied permission or unavailable GPS does not prevent a resident entering a useful address and description. Address entry is always required. Automatic reverse geocoding is not implemented.
- Tiles are loaded from `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, with visible OpenStreetMap contributor attribution. Internet connectivity is required for tiles. Viewing map tiles shares the requested map area with that provider. Browser GPS generally requires HTTPS or localhost. Permission and actual device accuracy depend on the browser/device and were not physically verified by automated tests.

## Photos: deliberately incomplete

No fake camera, file picker or upload button is exposed. The public form states that this sprint saves text and coordinates only. Photo capture/upload is a core remaining reporting requirement and needs backend support before it can be offered as a working feature:

1. Add an attachment endpoint (for example POST `/api/incidents/{id}/attachments`) and a retrieval contract.
2. Configure private object storage and server-only credentials, with controlled access to retrieved files.
3. Add attachment metadata linked to an incident (object key, trusted content type, byte size, creation timestamp); this will require a separate future database migration.
4. Enforce file count/size/content checks, safe filenames, image processing and location/EXIF privacy handling. Define cleanup and failed-upload behavior.
5. Then connect mobile camera capture and photo selection to real upload progress, persisted attachments and retry handling.

Assignment, status changes, internal notes, authentication/authorization and stronger public tracking access controls also remain outside this revision. WhatsApp, IoT simulation and AI were not added.

## Brand reference and accessible tokens

Inspected on 29 October 2026:

- Official About page: https://www.mangaung.co.za/About/
- Logo linked from that page: https://www.mangaung.co.za/About/Mangaung_CoA.png

The reference explicitly identifies green, orange and black and the linked logo was visually inspected. It does not provide verified HEX specifications. All values in `frontend/src/tokens.css` are **WaterWatch prototype design choices**, not official municipal colour values. Primary actions use dark green, highlights use orange, operations navigation uses charcoal with green active navigation, and page surfaces use white/light neutrals. Orange is paired with dark text, rather than small white text on orange.

Calculated text contrast ratios for the chosen tokens: white on primary green 7.90:1; main text on page 12.09:1; muted text on white 6.46:1; secondary text on white 5.02:1; orange ink on light orange 7.38:1; navigation text on charcoal 13.30:1. These numerical checks are not a claim of a complete accessibility audit. Existing responsive layouts were retained and public pages include keyboard focus, skip links and labelled form fields.

WaterWatch Free State keeps its own droplet mark. The municipal logo is a reference, not an endorsement badge. Both experiences visibly say **Hackathon Prototype** and explicitly disclaim official municipal service/endorsement.

## Hosting and configuration

The existing `VITE_API_BASE_URL` and development origins (`http://localhost:5173`, `http://127.0.0.1:5173`) are unchanged. Use the root README's two-terminal commands. For production static hosting, configure an SPA fallback to `index.html` for the five React routes; API `/api/*` requests must still reach the ASP.NET service. Do not rewrite API responses into frontend HTML. Direct route loads work under Vite's SPA fallback.

No existing database migration was edited, regenerated or applied by this revision. Future media persistence is intentionally documented rather than pretending uploads work.

## Verification of this revision — 29 October 2026

- Backend: `dotnet build WaterWatch.slnx --no-restore` passed with 0 warnings and 0 errors. `dotnet test WaterWatch.slnx --no-build --no-restore` passed 21 tests, 0 failed and 0 skipped, with the saved Supabase setting enabled.
- Frontend: `npm run build` passed TypeScript checking and the Vite production build. Final `npm test` run passed 32 tests in 4 files, 0 failures.
- Regression coverage retains dashboard loading/empty/error/search/filter behavior and moves submission scenarios to the independent public routes. New tests cover full references, verified confirmations, tracking/not-found, details navigation, coordinate validation and POST data, GPS success/denial, and the Leaflet adapter's click/centre/marker/tile-error behavior. Test fixtures remain outside the operational view.
- Live HTTP: `/report`, `/report/success`, `/track`, `/operations` and a direct `/operations/incidents/:id` URL each returned the Vite SPA document with status 200. This verifies route fallback, not browser rendering.
- Live lookup of an unknown UUID returned 404 and `Access-Control-Allow-Origin: http://localhost:5173`. POST preflight returned 204 with the same allow-origin header. Existing allowed/unlisted-origin tests passed.
- Git comparison confirmed no changes to the database model, DbContext, migrations, connection configuration or CORS allowlist. The existing PostgreSQL migration was not rerun.
- Browser QA remains incomplete: the in-app browser timed out waiting for its webview to attach. Actual tile rendering, physical GPS permission/accuracy, mobile visual layout and browser-console checks could not be verified. Map/GPS interaction tests use controlled test doubles and do not replace those device/browser checks.
