# Today's event attendance badges

`get_team_day_clock_status(team, date)` returns only per-staff boolean badges: clocked in, currently working, on break, and clocked out. It combines daily timecards (`work_date`) and legacy event-linked records (`events.event_date`), grouping multiple roles/records once per staff member. Wages, actual timestamps, notes and payroll data are not returned.

The function is a narrowly scoped security definer because ordinary staff can otherwise read only their own raw attendance rows. It explicitly requires an authenticated membership of the requested team, fixes `search_path`, fully qualifies table references, and revokes anonymous/public execution. Existing attendance RLS and compensation permissions remain unchanged.

The UI matches current period-based assignments to the selected event, retains legacy event-linked assignments, excludes studio duties from the event roster, and deduplicates multiple roles. Daily attendance is shared between same-day performances. Clocked staff with no shift that day are listed separately; staff assigned to another performance or the studio are not mislabeled as unscheduled.

Statuses load on entry, update on focus/visibility and every 30 seconds while visible, and can be manually refreshed. Read failures are shown as unknown rather than unclocked. The event date follows Japan time.

Apply `supabase/manual/day_clock_status.sql` before deploying. Run `node --test tests/today-staff-status.test.mjs`. Database checks should cover team member access, outsider rejection, daily and legacy records, multiple-role deduplication, break/checkout flags, and rollback all fixture data.
