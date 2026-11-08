-- Backward compatible: existing total labor budgets retain their meaning until edited.
ALTER TABLE public.monthly_budgets
 ADD COLUMN IF NOT EXISTS hourly_labor_budget integer NULL;
ALTER TABLE public.monthly_budgets
 DROP CONSTRAINT IF EXISTS monthly_budgets_hourly_labor_budget_nonnegative;
ALTER TABLE public.monthly_budgets
 ADD CONSTRAINT monthly_budgets_hourly_labor_budget_nonnegative
 CHECK (hourly_labor_budget IS NULL OR hourly_labor_budget >= 0);
COMMENT ON COLUMN public.monthly_budgets.hourly_labor_budget IS
 'Owner-entered variable hourly wage budget only. NULL indicates a legacy total labor budget; labor_budget retains a total snapshot for compatibility.';
