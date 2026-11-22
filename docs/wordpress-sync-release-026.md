# v0.2.6 candidate – manual slider + safe unpublish

Status: locally linted and mocked; **not installed** on thunder-snake.com and **not production approved**.

WordPress plugin ZIP provided in the conversation: `tsa-event-sync-v0.2.6-safe-unpublish.zip`
SHA256: `36da7cead18b991eb5136160fee0366cb752c7a649228e8aa9c9ea483fafc3c8`

Changes relative to v0.2.5:
- The home page PICK UP is manually run by XO Slider ID 6647. Server ignores legacy `pickup` requests; the app feature-branch event projection omits that property.
- `unpublish` is idempotent: if the mapped post is already `draft` or `trash`, do not call `wp_update_post`.
- On transition to draft, verify both the resulting WordPress status and the existing external-ID mapping; error if either fails.
- In every plugin upgrade, reset WordPress publishing mode to `dry_run`.

Tested locally against PHP 8.4:
- `php -l` passed.
- Six mocked cases passed: mapped publish->draft, already-draft no write, legacy/manual mapping blocked, duplicate mapping blocked, trash no change, unmapped no-op.

**Outstanding:** An end-to-end live WordPress **publish->draft** test still needs one controlled trial with an explicitly allowed test event ID. No manual production event should be modified. Automatic content, date, flyer **updates** of mapped posts remain blocked with `tsa_sync_updates_paused`; a safe update/reconciliation path requires separate implementation and tests.

The draft PR's older PHP receiver source is not yet identical to the independently packaged site release; **do not merge** until reconciled and tested.
