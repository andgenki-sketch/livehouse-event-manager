ALTER TABLE public.payroll_confirmations
 ADD COLUMN IF NOT EXISTS confirmation_method text NOT NULL DEFAULT 'normal',
 ADD COLUMN IF NOT EXISTS exception_reason text;
ALTER TABLE public.payroll_confirmations
 DROP CONSTRAINT IF EXISTS payroll_confirmations_confirmation_method_check;
ALTER TABLE public.payroll_confirmations
 ADD CONSTRAINT payroll_confirmations_confirmation_method_check
 CHECK (confirmation_method IN ('normal','manual_exception'));
ALTER TABLE public.payroll_confirmations
 DROP CONSTRAINT IF EXISTS payroll_confirmations_manual_exception_details_check;
ALTER TABLE public.payroll_confirmations
 ADD CONSTRAINT payroll_confirmations_manual_exception_details_check
 CHECK (
  confirmation_method <> 'manual_exception' OR
  (exception_reason IS NOT NULL AND length(btrim(exception_reason)) BETWEEN 5 AND 500
   AND confirmed_amount > 0 AND confirmed_minutes >= 0 AND work_days >= 1)
 );
COMMENT ON COLUMN public.payroll_confirmations.confirmation_method IS
 'normal=verified complete timecards; manual_exception=owner-reviewed attendance exception';
COMMENT ON COLUMN public.payroll_confirmations.exception_reason IS
 'Owner verification details for payroll confirmed despite incomplete or missing punches';