TSA Event Sync Receiver v0.2.9 — safe manual rollout candidate

NOT APPROVED FOR AUTOMATIC LIVE SYNC without a single-event test.

The event-sync receiver updates only posts previously created by the plugin with
the exact _tsa_sync_external_id mapping. It does not claim manual WordPress events,
does not edit XO Slider, and never pushes PICKUP categories from the app.

Safety behavior:
* On version upgrade, the receiver resets to 接続テストのみ (dry_run).
* Single-event WordPress write permission requires an exact external event ID.
* Existing posts are compared with a saved snapshot before any modification.
* Existing v0.2.6 posts can record a baseline only if the source and WordPress
  content still match exactly. Otherwise manual reconciliation is required.
* Updated posts are staged as drafts, then published only after verification of
  event title, details, local/UTC timed TEC metadata, price, and flyer.
* On a failed update, the post remains a draft to avoid publishing corrupt data.
* Full write permission is locked until the same test event has been
  successfully created, updated, and unpublished in single-event mode; a WordPress
  administrator must acknowledge the full-mode change separately.
* The Next.js production app also requires an independent
  WORDPRESS_SYNC_PRODUCTION_ENABLED=true server environment variable.
  Its absence disables publication by default.

Local validation: PHP syntax + 23 isolated mock cases passed on 2026-11-24.
End-to-end compatibility with this particular WordPress/TEC install remains
untested; do NOT enable all-events publication without the live canary.

Release ZIP SHA-256:
c6928b91d486b76278cdc2b049c08f6cb5c4f2200695c9bdf1919ed2018dd75e
