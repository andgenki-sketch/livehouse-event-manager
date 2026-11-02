# WordPress sync staging checklist

Current status: **event save is wired to a gated dry-run API; WordPress plugin has a separately guarded write implementation. Nothing has been installed on the production WordPress site.**

## Setup
1. Back up WordPress files and database. Restore-test the backup.
2. Install the receiver plugin on a staging WordPress site, not production.
3. Set a 32+ character random TSA_EVENT_SYNC_SECRET in staging wp-config.php. Configure the same secret only as a server-side environment variable in the app's staging environment.
4. Set the staging endpoint to https://STAGING-HOST/wp-json/tsa-sync/v1/events; never expose secrets through NEXT_PUBLIC_*.
5. Verify that requests without a valid HMAC signature are rejected.
6. Verify an authorized request returns dry_run=true and does not create or change a post.

## Next implementation gates
- Connect an authenticated server-only action to event saves; do not send WP credentials from app/page.js.
- Authenticate the user, verify their team and edit permission, and re-read the event from Supabase on the server. Never trust client-provided event content or team IDs.
- Add a durable outbox / retry mechanism; distinguish Supabase save success from WordPress sync failure.
- Enforce replay protection with a unique request nonce and durable nonce tracking before allowing real writes.
- Determine event post metadata mapping, especially tribe_events date/time and wpos_event array.
- Reconcile existing WordPress event IDs manually in dry run before first live upsert.
- Implement real upsert/unpublish only after staging review and explicit production approval.
- Run: node --test tests/wordpress-event-projection.test.mjs tests/wordpress-sync-transport.test.mjs

## Important
The current receiver is **acknowledgment-only**. Its signed requests use a five-minute timestamp window, but it does not yet enforce single-use nonces. Do not enable mutating operations with this receiver until replay prevention is implemented.

## Feature gates and rollout
- App requires `WORDPRESS_SYNC_STAGING_ENABLED=true` before any outbound sync request. Leave unset in production.
- App transport defaults to requiring `dry_run=true` from WordPress, even if the receiver has write capability. It does not authorize live publication.
- WordPress receiver defaults to no writes. `TSA_EVENT_SYNC_ENABLE_WRITES` must remain absent or false until staging, backups, theme compatibility, concurrency and manual legacy reconciliation are verified and the owner approves production rollout.
- Requests use HMAC over `timestamp.nonce.body` and include a 128-bit random nonce. The receiver now atomically claims used nonces through a unique WordPress option name, without automatic cleanup yet. Verify concurrency and implement a bounded, tested cleanup mechanism before enabling writes.
- Mapped events use the `_tsa_sync_external_id` meta key. Existing manual posts are never automatically claimed. The collision check compares exact title and canonical local date; ambiguous posts need manual review.
- Write mode currently creates or updates a `tribe_events` post, stores event date metadata and selected `wpos_event` fields, and changes mapped posts to draft on unpublish. The end time defaults to start + 1 hour; verify The Events Calendar and theme behavior before using it.
- Flyer import, taxonomy/PICKUP mapping, durable outbox/retry, and reliable status history are **not implemented**. Do not advertise full automatic publication until they are.
- Do not put WordPress or Supabase secrets into GitHub, source files or chat.

- WordPress event dates now include UTC companion metadata. Validate against the installed The Events Calendar version and the site's calendar listing before enabling writes.
