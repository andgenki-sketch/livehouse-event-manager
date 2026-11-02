# WordPress sync staging checklist

Current status: **code prepared only; not connected or deployed**.

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
