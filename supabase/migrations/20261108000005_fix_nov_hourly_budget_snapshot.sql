-- Convert exactly the owner's existing November 2026 variable-pay target.
-- In November, the original 100000-yen legacy total was entered as an hourly budget.
-- Confirmed fixed salary effective November 2026: 850000 yen.
-- The guard ensures we never change a subsequent owner edit or other months.
UPDATE public.monthly_budgets
SET hourly_labor_budget=100000,
    labor_budget=950000
WHERE year=2026 AND month=11
  AND hourly_labor_budget IS NULL AND labor_budget=100000
  AND (SELECT count(*) FROM public.monthly_budgets
       WHERE year=2026 AND month=11 AND hourly_labor_budget IS NULL AND labor_budget=100000)=1;
