# WordPress sync v0.2.7 update candidate (NOT RELEASED)

Status: **local-only plugin candidate, not yet installed or verified on thunder-snake.com**. The live WordPress server still has independently packaged v0.2.6. The app's PR #48 still contains a **legacy v0.1.0 PHP receiver**, and must NOT be merged to production before code parity and live tests are completed.

Binary handoff in this conversation: `tsa-event-sync-v0.2.7-managed-updates-candidate.zip`
SHA-256: `9a0b014c85c327f1d4ba22a7303be6e8561bbefd99f7e4d4b806ba2cbda39ed6`

## Behavior implemented in the standalone ZIP

- Upgrade safety resets WordPress receiver mode to dry-run (`接続テストのみ`).
- Only exact existing `_tsa_sync_external_id` mappings can be updated. Manual events are not claimed.
- Every fresh import saves a snapshot of all plugin-owned WordPress fields.
- When existing mapped posts have a verified snapshot, a received upsert first checks all tracked fields have not been manually modified. Any difference gives a 409; no auto-overwrite.
- Stages an existing published post as draft, runs TEC ORM `tribe_events()->where('id', $id)->where('post_status', 'draft')->set_args(...)->save()`, verifies actual TEC local/UTC start and end dates and time zone, updates site theme fields and flyer, then republishes only after complete read-back validation. On failure the post remains a draft.
- For pre-v0.2.7 imports with no snapshot, accepts only an exactly matching, already-published upsert to capture a read-only baseline. App changes are rejected until a baseline exists. Manually drafted posts are not automatically revived.
- An explicit sync unpublish updates snapshot/ownership marker; a later published upsert can republish the same ID.
- XO Slider and WordPress PICKUP taxonomy are not modified.

Local PHP 8.4 syntax check passed. 17 isolated mock tests passed, including update, idempotence, manual edit conflict, moved-date collision, bad TEC update, base-lining, unpublish/re-publish, flyer replacement/removal, replay lock and new import.

## Caveats / release blockers

1. This is not an end-to-end test against the production TEC version. Official TEC documentation warns that ORM `save()` behavior can differ. Test the **exact single-event candidate** before production use.
2. A failed update intentionally leaves the event in DRAFT rather than showing partially updated public details. An operator must review/fix it; no transactional rollback is attempted.
3. The production GitHub branch PHP has not been reconciled with independently packaged plugin code. No production merge should occur.
4. Vercel preview WP-write environment switch was left disabled after the earlier test. WordPress must remain dry-run until a single test ID is explicitly authorized.

## Controlled trial

- Confirm an up-to-date WordPress backup.
- Install v0.2.7 ZIP, confirm receiver reset to dry_run.
- Use a newly created **test** event in the app, not a real event nor the manually drafted old post 10096 (which has no v0.2.7 snapshot).
- Allow exact ID on WP single mode and Vercel preview only.
- Create: verify title, date, times, price, featured flyer and WordPress post ID.
- Change one or more fields in app: resend, verify same WP post ID and metadata, no duplicate.
- Toggle publish OFF and check WP draft.
- Return WP mode to dry_run and disable preview writes. Keep test post draft.
