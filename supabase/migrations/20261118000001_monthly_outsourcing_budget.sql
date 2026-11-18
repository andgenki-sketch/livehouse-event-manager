-- Plan contractor costs independently of salary and ordinary expenses.
-- NULL represents an unentered plan; it must not be silently treated as zero.
ALTER TABLE public.monthly_budgets
 ADD COLUMN IF NOT EXISTS outsourcing_budget integer;
ALTER TABLE public.monthly_budgets
 DROP CONSTRAINT IF EXISTS monthly_budgets_outsourcing_budget_nonnegative;
ALTER TABLE public.monthly_budgets
 ADD CONSTRAINT monthly_budgets_outsourcing_budget_nonnegative
 CHECK (outsourcing_budget IS NULL OR outsourcing_budget >= 0);
COMMENT ON COLUMN public.monthly_budgets.outsourcing_budget IS 'Separate monthly budget for outsourced/contractor fees, excluding employee salary, hourly wages and other expenses; NULL means not set.';
