-- Owner-only monthly cashflow actual vs baseline plan. All amounts in yen.
-- NULL means unknown/unentered, never silently zero.
CREATE TABLE IF NOT EXISTS public.cashflow_monthly (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
 month date NOT NULL,
 scenario text NOT NULL CHECK (scenario IN ('actual','plan')),
 opening_balance bigint,
 sales_cash bigint CHECK (sales_cash IS NULL OR sales_cash >= 0),
 sales_cashless bigint CHECK (sales_cashless IS NULL OR sales_cashless >= 0),
 purchase_cost bigint CHECK (purchase_cost IS NULL OR purchase_cost >= 0),
 director_salary bigint CHECK (director_salary IS NULL OR director_salary >= 0),
 employee_salary bigint CHECK (employee_salary IS NULL OR employee_salary >= 0),
 transportation bigint CHECK (transportation IS NULL OR transportation >= 0),
 entertainment bigint CHECK (entertainment IS NULL OR entertainment >= 0),
 advertising bigint CHECK (advertising IS NULL OR advertising >= 0),
 communications bigint CHECK (communications IS NULL OR communications >= 0),
 rent bigint CHECK (rent IS NULL OR rent >= 0),
 utilities bigint CHECK (utilities IS NULL OR utilities >= 0),
 other_operating bigint CHECK (other_operating IS NULL OR other_operating >= 0),
 taxes bigint CHECK (taxes IS NULL OR taxes >= 0),
 statutory_benefits bigint CHECK (statutory_benefits IS NULL OR statutory_benefits >= 0),
 outsourcing bigint CHECK (outsourcing IS NULL OR outsourcing >= 0),
 long_loan_in bigint CHECK (long_loan_in IS NULL OR long_loan_in >= 0),
 short_loan_in bigint CHECK (short_loan_in IS NULL OR short_loan_in >= 0),
 other_finance_in bigint CHECK (other_finance_in IS NULL OR other_finance_in >= 0),
 long_loan_out bigint CHECK (long_loan_out IS NULL OR long_loan_out >= 0),
 short_loan_out bigint CHECK (short_loan_out IS NULL OR short_loan_out >= 0),
 loan_interest bigint CHECK (loan_interest IS NULL OR loan_interest >= 0),
 other_finance_out bigint CHECK (other_finance_out IS NULL OR other_finance_out >= 0),
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed')),
 source_note text NOT NULL DEFAULT '',
 evidence_note text NOT NULL DEFAULT '',
 management_note text NOT NULL DEFAULT '',
 reviewed_at timestamptz,
 reviewed_by uuid,
 updated_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT cashflow_month_start CHECK (EXTRACT(DAY FROM month)=1),
 CONSTRAINT cashflow_month_unique UNIQUE (team_id,month,scenario)
);
ALTER TABLE public.cashflow_monthly ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cashflow_monthly FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.cashflow_monthly TO authenticated;
DROP POLICY IF EXISTS cashflow_owner_read ON public.cashflow_monthly;
DROP POLICY IF EXISTS cashflow_owner_insert ON public.cashflow_monthly;
DROP POLICY IF EXISTS cashflow_owner_update ON public.cashflow_monthly;
DROP POLICY IF EXISTS cashflow_owner_delete ON public.cashflow_monthly;
CREATE POLICY cashflow_owner_read ON public.cashflow_monthly FOR SELECT TO authenticated
 USING (public.is_team_owner(team_id));
CREATE POLICY cashflow_owner_insert ON public.cashflow_monthly FOR INSERT TO authenticated
 WITH CHECK (public.is_team_owner(team_id));
CREATE POLICY cashflow_owner_update ON public.cashflow_monthly FOR UPDATE TO authenticated
 USING (public.is_team_owner(team_id)) WITH CHECK (public.is_team_owner(team_id));
CREATE POLICY cashflow_owner_delete ON public.cashflow_monthly FOR DELETE TO authenticated
 USING (public.is_team_owner(team_id));
CREATE INDEX IF NOT EXISTS cashflow_team_month_idx ON public.cashflow_monthly(team_id,month);
COMMENT ON TABLE public.cashflow_monthly IS 'Monthly cash receipts/disbursements, actual or reference plan, separately entered and owner reviewed. No auto-aggregation from event accrual revenue or payroll expenses.';
