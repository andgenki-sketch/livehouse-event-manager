-- EMERGENCY ROLLBACK for 20261008_contract_column_security_STAGED.sql
-- Use ONLY if the contract column privilege migration breaks production reads.
-- This restores the pre-migration table-wide SELECT grants; it REOPENS
-- contract data exposure and must be temporary. Do not apply proactively.
-- Existing RLS policies remain in effect; this does not change data.
BEGIN;
GRANT SELECT ON TABLE public.events TO anon, authenticated;
GRANT SELECT ON TABLE public.event_artists TO anon, authenticated;
COMMIT;

-- After rollback, verify:
-- SELECT has_column_privilege('anon','public.events','hall_rental_fee','SELECT');
-- SELECT has_column_privilege('authenticated','public.event_artists','guarantee','SELECT');
-- Both become true again; prioritize a corrected migration.
