# TSA Event Sync v0.2.5 — flyer/PICKUP release and controlled rollout
Date: 2026-11-21

## Current real-world verification
- Signed WordPress authentication has worked against thunder-snake.com.
- Initial v0.2.0 import created an incorrect 1970 date; manually corrected by owner. **Never auto-update this manually repaired record.**
- Isolated TEC event 10089 from the app: 2027-02-04 18:00 JST; _EventStartDateUTC 2027-02-04 09:00; _EventTimezone Asia/Tokyo; TEC all_day false.
- Site theme single '開場/開演' field is wpos_event['open'] with content `open 17:30 start 18:00`; hand-created events use the same field convention.
- Monthly schedule uses WordPress event posts and WordPress featured images. The WordPress editor has a PICKUP event category.
- v0.2.4 was installed on the live site as a dry-run diagnostic, but **live flyer and category transfer have not been tested**.
- Production Next.js still comes from the main branch; the integration is a draft feature PR.

## v0.2.5 standalone WordPress plugin ZIP
Generated and locally tested. SHA-256:
`7c74e73db33f017bf7cdc41c42e56449662c1cbed619db0fb86c9200e3dce12f`
It is distributed in the conversation as `tsa-event-sync-publication-v0.2.5-flyer-pickup.zip` and **has not been installed on WordPress**.

Changes:
1. Keeps all v0.2.4 dry-run defaults, HMAC authentication, exact event-ID single write approval, date-integrity checks and read-only diagnostic.
2. For a *new* post only, accepts only the uploader's UUID-based public Supabase Storage path from bucket `event-flyers`. URL host is fixed to project `dfvuynqpfpgeekgoksyu.supabase.co`; no client-provided URL, redirects, or arbitrary remote hosts.
3. Validates JPEG/PNG/WebP image contents and extension, 5 MB max download, image pixel limit, then copies to WordPress Media and sets a featured image **while still draft**. Media errors stop publication.
4. When app `website_pickup` is true, adds only the existing `PICKUP` term in `tribe_events_cat`. No automatic taxonomy creation. PICKUP requires a flyer.
5. Confirms featured image and PICKUP category after publish and moves the new event back to draft on failure.
6. Read-only diagnostic now shows featured image ID and PICKUP status.
7. As with previous versions, installing resets `tsa_sync_write_mode` to `dry_run`, preserving signing secret and manual event corrections.

## Tests completed locally
- `php -l` passed.
- 18 mocked WordPress flyer/path/PICKUP cases passed, including SSRF/path traversal, wrong MIME, oversize, redirects, media thumbnail, and exact-category mapping.
- 9 mocked event-write checks passed: draft-first publication, dated TEC meta, OPEN+START composite, featured image, PICKUP, and invalid-flyer rollback.
- **Mocked tests are not a WordPress end-to-end test.**

## App/transport feature branch
- `/api/wordpress-sync` remains protected by authenticated membership, Preview target and exact allowlisted event ID.
- Transport timeout is raised to 50s for media handling; a flyer upsert does not automatically retry a timed-out request to avoid duplicate/ambiguous results. Function max duration is 60s.
- API reports a featured_image_id when WordPress returns one.
- GitHub/Vercel preview build was READY after the app change.
- DO NOT enable broad publication yet: the feature branch source PHP receiver predates the standalone v0.2.5 ZIP. Before merge, commit the reviewed production PHP source into this repo and run a native TEC staging test.

## Outstanding production launch requirements
- Install v0.2.5 with an existing Duplicator backup; verify WordPress stays dry_run.
- Create/choose an isolated new test event that includes a real app flyer; no manual WordPress event on same date.
- In WordPress allow **only that exact event ID**, and in Vercel Preview allow only that exact ID; never add a production secret to a client bundle.
- Verify WordPress 200/accepted, post type tribe_events, correct date/OPEN/START/UTC and non-all-day TEC metadata, post featured image and actual monthly schedule image, no duplicate.
- If testing PICKUP, verify that category highlights the event in the existing top-page slider without breaking ordering or showing an event without an image.
- Switch WordPress mode back to dry_run and test post to draft after test.
- Full automatic **updates** remain paused; add a manual-event reconciliation workflow and safe update contract before enabling all-events mode.
- Automatic featured image replacement, PICKUP ordering, auto retries/outbox and per-event send audit are not yet implemented.

## Safety
Never expose secrets in GitHub, screenshots or test logs. Do not merge PR or enable WordPress all-events mode before version parity and a real site image test.
