# WaterWatch interface refinement

This change refines the existing React application. It does not replace the application, add operational data, or change backend endpoints, authorization, database models or migrations.

## Existing functionality retained

- Resident reporting, map pin selection, optional GPS permission, coordinate validation, report confirmation and reference tracking.
- Staff sign-in, report search and filters, real-data summary cards, report details and location maps.
- Report progress, priorities, maintenance assignments, private staff notes and activity history.
- Loading, empty, validation and error states; public tracking continues to exclude private staff information.

## Presentation changes

- Removed prominent prototype banners and implementation explanations from the main screens. One footer disclosure identifies WaterWatch as independent and not an official Mangaung municipal service.
- Standardized resident-facing report terminology and staff-facing Water management, Report progress, Maintenance assignment and Activity history labels.
- Simplified reporting instructions, confirmation and tracking copy, sign-in guidance and error messages without hiding failures.
- Removed redundant explanatory panels and decorative dashboard content. Retained the existing green, orange and charcoal design tokens; no claim is made that their HEX values are official municipal specifications.
- Improved form width, typography, buttons, filters, cards, spacing and mobile layouts. Skip navigation remains available on keyboard focus without covering the logo when inactive.
- Updated the existing frontend tests for the new copy. Test workers run one at a time to avoid the observed worker-start failures on this machine; no tests were removed and the existing timeouts were retained.

## Verification

- `npm.cmd --prefix frontend run build`: TypeScript and production build passed. Vite reported a plugin timing advisory, not a compilation error.
- `npm.cmd --prefix frontend test`: 43 tests passed.
- `dotnet build WaterWatch.slnx --no-restore`: passed with zero warnings and zero errors.
- `dotnet test WaterWatch.slnx --no-build --no-restore`: 48 tests passed, zero failures or skipped tests. The configured PostgreSQL tests ran inside their existing rollback transactions.
- Browser review covered the resident form at 390px width with loaded map tiles and staff sign-in at desktop and narrow widths. No browser warnings or errors were recorded on the reviewed pages. The protected management workflow was covered by the existing automated tests; it was not signed into again during this visual review.

## Remaining limits

- Photos still require backend storage and upload support. The form says attachments are unavailable and offers no inactive upload control.
- The existing shared staff access key remains the current authorization mechanism. Individual staff accounts are outside this refinement.
- GPS permission and report submission were covered by automated tests; this visual review did not request the user's physical location or create another database report.
- No sensor views, new features or sample operational records were added.

Start commands remain in the README and `docs/TASK3_WORKFLOW.md`.
