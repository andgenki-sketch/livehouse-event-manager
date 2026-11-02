# WordPress event sync — implementation contract (draft)

## Objective
Only events explicitly marked `website_published=true` in Live House Manager should appear on Thunder Snake ATSUGI's WordPress public schedule. Never expose contracts, staffing, payroll, internal notes, or other private columns.

## Current state (verified)
- Next.js event form stores `website_published`, `public_description`, `flyer_path` and public schedule fields in Supabase `events`.
- WordPress uses The Events Calendar `tribe_events` and custom Thunder Snake theme metadata for schedule rendering.
- No WordPress authentication credentials, REST write endpoint, or metadata mapping has been verified.
- Therefore do **not** enable any automated writes yet.

## Proposed protocol
1. A server-only, authenticated worker reads a fixed allowlist of event fields; never send Supabase service credentials to the browser or WordPress.
2. Event changes are sent to a WordPress custom REST endpoint over HTTPS with signed requests and replay protection. Keys must be configured in platform secret settings, not source code.
3. WordPress checks the signature, timestamp, payload schema and permitted source, and maps an immutable external event ID to one WordPress event ID. Upsert by that ID; never create duplicates.
4. `website_published=false` transitions previously synced events to draft/private (not destructive deletion). Events never published must not be created.
5. Handle flyer URL carefully: allowlisted HTTPS public object only, with validation and graceful missing-image handling. Existing WordPress featured image is preserved unless an explicit replacement is requested.
6. Keep event date, timezone Asia/Tokyo, title, open/start times, venue, price, and public description separate. Do not overwrite manual WordPress-only fields without an explicit mapping decision.
7. Retries must be idempotent; record sync status, last successful revision, and sanitized error diagnostics. No infinite retry loop.
8. Import/reconciliation of preexisting WordPress events requires a reviewed match list and dry run before enabling updates.

## Preconditions before live code
- Confirm WordPress endpoint implementation path and REST availability.
- Confirm exact theme metadata keys and `tribe_events` date/time handling.
- Choose source of truth and conflict policy for manually edited WordPress events.
- Configure secrets securely and test in staging.
- Test checked, unchecked, edited, duplicated, date-changed, and failed requests.
- Obtain explicit approval before production publishing.

This file is planning-only and does not change the running app or WordPress site.
