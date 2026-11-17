# TSA WordPress event sync — limited publication trial (v0.2.0)

## Status (2026-11-17)
- HMAC-signed WordPress connection **confirmed against thunder-snake.com** with the safe-setup v0.1.4 plugin in dry-run mode.
- Vercel Preview environment contains the endpoint, a sensitive signing secret, and staging enabled.
- App API has an additional `WORDPRESS_SYNC_LIVE_ENABLED=true` toggle; it is **currently unset**. No WP writes are sent by the Preview app without this opt-in.
- The standalone v0.2.0 upgrade ZIP is prepared separately for manual WordPress installation. The ZIP itself is **not** deployed to WordPress yet and must not be confused with the older PHP file in this feature branch.

## Single-event test workflow
1. Back up WordPress database and files.
2. Replace the existing TSA Event Sync WordPress plugin with v0.2.0 (same plugin folder). Verify the existing signing secret remains configured. Do **not** rotate secrets.
3. Pick a **real, approved future event not yet represented anywhere in the WordPress schedule**. The app calendar already contains shortened titles for some manually published WordPress events; do not choose these as new imports.
4. In the Preview app, open the event detail and copy the `HP連携ID` UUID.
5. In WordPress Tools → TSA Event Sync, select `指定イベント1件だけ公開を許可`, enter the UUID, save. Keep all-events mode disabled.
6. In Vercel **Preview only**, create `WORDPRESS_SYNC_LIVE_ENABLED=true` and redeploy the feature branch. Never set it in production until the trial and source code review are complete.
7. Edit/save that one event in the Preview app with `website_published=true`, public title/description, and a valid **START** time; check for expected WordPress publication.
8. Compare official site event title, date, OPEN/START, price and visibility, and verify no duplicate. Test a second save (upsert) and clearing publication (unpublish to draft). Roll back by selecting `接続テストのみ` in WP settings if incorrect.
9. Only after verification, reconcile existing manually managed WP events, enable broader scope, and merge/release the app.

## Current hard limitations
- All inspected 2026 upcoming events in the app currently have `start_time=null`. A real START time must be set before publishing; do not invent it.
- v0.2.0 intentionally blocks **all new imports on dates with manual WordPress events**, even if the titles differ. This reduces duplicate risk but may prevent an otherwise distinct show on the same date.
- Public flyer image importing and top-page PICK UP slider mapping are not implemented.
- The app does not store end times. v0.2.0 uses a documented one-hour **technical TEC indexing placeholder**, not a claim about the actual performance duration.
- Durable outbox/retries after a request has ended are not yet implemented.
- The provided v0.2.0 PHP was locally linted and passed a mocked WordPress smoke test covering dry-run, creation, repeat upsert, draft on unpublish, missing START, title collisions and same-day manual events. It still requires a live single-event verification before enabling global writes.

## The Events Calendar API
Use The Events Calendar's `tribe_create_event` / `tribe_update_event` helpers or its ORM rather than plain `wp_insert_post` to ensure event indexes are maintained. Follow installed TEC version compatibility before merging the standalone receiver source back into the repository.
