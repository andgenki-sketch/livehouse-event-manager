-- READ ONLY: run before restricting SELECT on events/event_artists.
-- Any exposed view or RPC listed here requires manual review before deployment.
-- These checks do NOT replace authenticated role tests or public website smoke tests.

-- Current SELECT privileges for sensitive fields (true means directly readable).
SELECT t.table_name, c.column_name,
       has_column_privilege('anon', format('public.%I',t.table_name), c.column_name,'SELECT') AS anon_can_read,
       has_column_privilege('authenticated',format('public.%I',t.table_name),c.column_name,'SELECT') AS authenticated_can_read
FROM (VALUES ('events'),('event_artists')) AS t(table_name)
JOIN information_schema.columns c ON c.table_schema='public' AND c.table_name=t.table_name
WHERE (t.table_name='events' AND c.column_name IN
 ('hall_rental_fee','hall_equipment_fee','attendance_guarantee','hall_rental_memo','memo','revenue_budget','video_shooting','after_party'))
   OR (t.table_name='event_artists' AND c.column_name IN
 ('guarantee','ticket_quota_price','ticket_quota_count','expected_attendance','equipment_fee_enabled','memo','notes'))
ORDER BY t.table_name,c.column_name;

-- Views and materialized views that might expose underlying contract columns.
SELECT schemaname,viewname,definition
FROM pg_views
WHERE schemaname NOT IN ('pg_catalog','information_schema')
  AND (definition ILIKE '%event_artists%' OR definition ILIKE '%public.events%' OR definition ILIKE '%hall_rental_fee%');

SELECT schemaname,matviewname,definition
FROM pg_matviews
WHERE definition ILIKE '%event_artists%' OR definition ILIKE '%public.events%' OR definition ILIKE '%hall_rental_fee%';

-- Database functions mentioning sensitive tables/columns: review SECURITY DEFINER and EXECUTE grants.
SELECT n.nspname AS schema_name,p.proname AS function_name,
       p.prosecdef AS security_definer,
       pg_get_function_arguments(p.oid) AS arguments,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_can_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema')
  AND (pg_get_functiondef(p.oid) ILIKE '%hall_rental_fee%'
       OR pg_get_functiondef(p.oid) ILIKE '%event_artists%'
       OR pg_get_functiondef(p.oid) ILIKE '%revenue_budget%')
ORDER BY n.nspname,p.proname;

-- Verify finance read policies are production-staff-only.
SELECT tablename,policyname,cmd,qual
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('settlements','expenses','event_artist_finance','monthly_budgets')
  AND cmd='SELECT'
ORDER BY tablename,policyname;

-- Before deployment: test public site, event create/edit, booking create/edit,
-- event duplication, and every staff role against the new schema.
