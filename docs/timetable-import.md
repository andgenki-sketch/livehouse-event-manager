# Timetable import

Open an event from the calendar and choose **タイムテーブル → PDF・画像から読み取る**.

PDF text is extracted with PDF.js. Scanned PDFs and images are read locally with Japanese/English Tesseract OCR. Worker scripts, model files, fonts and PDF resources are copied from pinned npm dependencies by `npm run prepare:timetable` before development and production builds. No provider key, external OCR service, or per-read API charge is required. Selected files stay in the browser until the user registers the result with original-file retention enabled.

The layout parser targets TSA's timetable template: left-hand time column, central rehearsal/performance content, right-hand notes, and performer information above the schedule. Other layouts may need manual correction. Never infer a time for an untimed transition: these are already included in the rehearsal slot. Untimed soundcheck rows are retained in the review draft, unchecked until a start time is supplied. OCR is less reliable than embedded PDF text; review is required before registration.

Limits: PDF/JPEG/PNG/WebP, 10 MiB per file, five PDF pages, 200 selected schedule rows. Images above 50 megapixels are rejected; OCR input is scaled to reduce memory usage. An internet connection is needed to load application/worker assets, with browser model caching thereafter.

Original files use the existing private `event-documents` bucket. `import_event_timetable` atomically saves document metadata, schedule rows and performer information. It runs with invoker permissions; only owner/production members of the event's team may import. All team members may read registered schedules and performer information. Performer data does not modify bookings or artist master records.

Append mode skips exact duplicate schedule identities. Replace mode checks an exact snapshot of the registered schedule before deleting/replacing anything. Import UUIDs make successful retries idempotent. Source files are retained as ordinary event documents and opened with short-lived signed URLs.

Apply `supabase/manual/timetable_import.sql` before deploying. Build via `npm run build` so that the prebuild asset preparation runs.

Run `node --test tests/timetable-import.test.mjs` for parser, validation and duplicate/snapshot checks. Database checks should use rollback transactions. Browser verification should cover embedded PDF text, image OCR, review/edit/save, original-file retention, append/replace, read-only permissions, and narrow screens.
