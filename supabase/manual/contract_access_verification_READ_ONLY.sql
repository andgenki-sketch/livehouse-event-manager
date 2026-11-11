-- Read-only contract access verification. Run before and after permission migration.
-- Each query should be executed as the named database role with an appropriate JWT.
-- Do not run the role simulation in production sessions that hold elevated privileges.
--
-- 1. Anonymous should never be able to execute contract RPCs.
SELECT has_function_privilege('anon','public.get_event_contracts(uuid)','EXECUTE') AS anon_event_rpc,
       has_function_privilege('anon','public.get_event_artist_contracts(uuid)','EXECUTE') AS anon_artist_rpc;
--
-- 2. Verify that column SELECT grants are absent for restricted fields.
SELECT
  has_column_privilege('anon','public.events','hall_rental_fee','SELECT') AS anon_hall_fee,
  has_column_privilege('authenticated','public.events','hall_rental_fee','SELECT') AS auth_hall_fee,
  has_column_privilege('anon','public.event_artists','guarantee','SELECT') AS anon_guarantee,
  has_column_privilege('authenticated','public.event_artists','guarantee','SELECT') AS auth_guarantee;
-- Expected after final migration: all four false.
--
-- 3. Verify that no general-staff JWT can invoke contract RPCs to obtain values.
--    An owner/member JWT should obtain its own team's values only.
-- 4. Test published event on public site, calendar, day view, booking,
--    contract editing, and finance report as each role.
-- 5. Inspect views, materialized views and SECURITY DEFINER functions for leaks.
-- 6. Confirm that UPDATE/INSERT column privileges and RLS do not permit
--    general_staff, technical_manager or viewer to alter contract values.
