-- Budget management v1: separate monthly labor budget from non-labor expense budget.
-- Production migration applied via Supabase MCP on 2026-11-08.
ALTER TABLE public.monthly_budgets
  ADD COLUMN IF NOT EXISTS labor_budget integer NOT NULL DEFAULT 0;
ALTER TABLE public.monthly_budgets
  DROP CONSTRAINT IF EXISTS monthly_budgets_labor_budget_check;
ALTER TABLE public.monthly_budgets
  ADD CONSTRAINT monthly_budgets_labor_budget_check CHECK (labor_budget >= 0);
-- Read access remains owner/member via the existing select policy.
-- Only the team owner may update financial budgets, even via direct API calls.
DROP POLICY IF EXISTS monthly_budgets_team_insert ON public.monthly_budgets;
CREATE POLICY monthly_budgets_team_insert ON public.monthly_budgets
  FOR INSERT TO authenticated WITH CHECK (public.is_team_owner(team_id));
DROP POLICY IF EXISTS monthly_budgets_team_update ON public.monthly_budgets;
CREATE POLICY monthly_budgets_team_update ON public.monthly_budgets
  FOR UPDATE TO authenticated USING (public.is_team_owner(team_id))
  WITH CHECK (public.is_team_owner(team_id));
DROP POLICY IF EXISTS monthly_budgets_team_delete ON public.monthly_budgets;
CREATE POLICY monthly_budgets_team_delete ON public.monthly_budgets
  FOR DELETE TO authenticated USING (public.is_team_owner(team_id));
