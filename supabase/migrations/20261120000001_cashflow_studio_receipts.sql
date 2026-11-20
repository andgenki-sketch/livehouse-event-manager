-- Add STUDIO SNAKE receipts as separate nullable cashflow categories.
-- Null is intentionally "not yet classified" rather than verified zero.
-- This migration does not reclassify or rewrite the existing 2026/09–2027/08 plan.
ALTER TABLE public.cashflow_monthly
 ADD COLUMN IF NOT EXISTS studio_sales_cash bigint,
 ADD COLUMN IF NOT EXISTS studio_sales_cashless bigint;
ALTER TABLE public.cashflow_monthly
 DROP CONSTRAINT IF EXISTS cashflow_studio_sales_cash_nonnegative;
ALTER TABLE public.cashflow_monthly
 ADD CONSTRAINT cashflow_studio_sales_cash_nonnegative
 CHECK (studio_sales_cash IS NULL OR studio_sales_cash >= 0);
ALTER TABLE public.cashflow_monthly
 DROP CONSTRAINT IF EXISTS cashflow_studio_sales_cashless_nonnegative;
ALTER TABLE public.cashflow_monthly
 ADD CONSTRAINT cashflow_studio_sales_cashless_nonnegative
 CHECK (studio_sales_cashless IS NULL OR studio_sales_cashless >= 0);
COMMENT ON COLUMN public.cashflow_monthly.studio_sales_cash IS
 'STUDIO SNAKE money actually received in cash during this month, excluding amounts in the existing general sales fields; null means unknown.';
COMMENT ON COLUMN public.cashflow_monthly.studio_sales_cashless IS
 'STUDIO SNAKE money actually deposited electronically during this month, excluding amounts in the existing general sales fields; null means unknown.';
NOTIFY pgrst, 'reload schema';
