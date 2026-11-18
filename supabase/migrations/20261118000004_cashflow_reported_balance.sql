-- Keep the independently confirmed/recorded closing balance separate
-- from calculated cash movement so reconciliation differences remain visible.
ALTER TABLE public.cashflow_monthly ADD COLUMN IF NOT EXISTS reported_closing_balance bigint;
COMMENT ON COLUMN public.cashflow_monthly.reported_closing_balance IS
 'Monthly closing cash/funding balance according to statement, owner ledger, or original reference plan. Signed yen; separate from calculated monthly net.';
-- Only fill untouched reference-plan records, never live actual data.
UPDATE public.cashflow_monthly c
SET reported_closing_balance=src.closing_in_man_yen*10000,
    updated_at=now()
FROM (VALUES
 ('2026-09-01'::date,-229),('2026-10-01'::date,-278),
 ('2026-11-01'::date,-307),('2026-12-01'::date,-261),
 ('2027-01-01'::date,-300),('2027-02-01'::date,-259),
 ('2027-03-01'::date,27),('2027-04-01'::date,-52),
 ('2027-05-01'::date,-61),('2027-06-01'::date,-70),
 ('2027-07-01'::date,-79),('2027-08-01'::date,107)
) AS src(month,closing_in_man_yen)
WHERE c.team_id='26764cb8-aa2c-4a6e-af39-50d04fe8debf'::uuid
 AND c.scenario='plan' AND c.month=src.month
 AND c.reported_closing_balance IS NULL
 AND c.status='draft'
 AND c.source_note LIKE '%サンスネ資金繰り表.xlsx%';
