# WordPress date-integrity incident (2026-11-18)

## Observed
- During the first one-event publication test, the owner found the 2026-11-28 event in WordPress, but its date was shown as 1970. The owner manually corrected the WordPress event. Do not overwrite that correction.
- The Supabase source event ID is `a05db497-0d94-4aa2-851e-f00c6fc0e4c1`, expected date 2026-11-28, OPEN/START 18:00 JST. The cause in the installed TEC version has not yet been proven.
- The v0.2.0 production WordPress ZIP used the legacy `tribe_create_event` helper and did **not verify** the stored TEC date fields before publishing.

## Protective actions
- WordPress admin: set `TSA Event Sync → 接続テストのみ` until a verified upgrade is installed.
- The Vercel **Preview** environment `WORDPRESS_SYNC_LIVE_ENABLED` has been set to `false`. A deployment rebuild is required; old previews snapshot the earlier value, so the WordPress-side dry-run switch is essential.
- The Next.js event sync API now refuses outbound requests entirely when the live switch is off. This fixes the prior risk where a dry-run-expected client still sent a signed request to a receiver configured for writes.
- A standalone WordPress emergency upgrade **v0.2.1** has been produced outside the repo and syntax/smoke tested; it resets write mode to dry-run once on upgrade, blocks writes to legacy mapped events, uses the documented TEC ORM for new events, and checks local and UTC stored dates before publishing. This ZIP is **not** the same source as the older receiver PHP in this branch. Do not promote the branch's PHP as the production receiver until it is replaced by reviewed v0.2.1 or later source.

## Verification before resuming
1. Back up WordPress files and DB.
2. Upgrade the existing WordPress receiver, preserving the signing secret, and verify mode is dry-run.
3. Verify the manually corrected event remains on 2026-11-28 at 18:00 in WP editor and public schedule.
4. Verify the installed TEC version and run a separate isolated new-event test; the ORM must persist `_EventStartDate`, `_EventEndDate`, `_EventStartDateUTC`, `_EventEndDateUTC` and `_EventTimezone` with exact expected dates.
5. Reconcile the manually edited event explicitly; do not automatically update or unpublish the existing mapped post.
6. Only then decide whether to restore one-event sync. Never enable all-events mode based solely on an API success response.

## API notes
The Events Calendar documents `tribe_create_event()` as legacy and recommends the `tribe_events()` ORM. The docs also report historical 1970 date failures when time/date fields are absent or incorrectly parsed. Both start and end datetime must be validated *after* TEC writes.
