-- Keep hourly exception review strict, while allowing an owner to approve
-- a monthly-salary amount without falsely certifying incomplete work time.
ALTER TABLE public.payroll_confirmations
 DROP CONSTRAINT IF EXISTS payroll_confirmations_confirmation_method_check;
ALTER TABLE public.payroll_confirmations
 ADD CONSTRAINT payroll_confirmations_confirmation_method_check
 CHECK (confirmation_method IN ('normal','manual_exception','salary_exception'));
ALTER TABLE public.payroll_confirmations
 DROP CONSTRAINT IF EXISTS payroll_confirmations_manual_exception_details_check;
ALTER TABLE public.payroll_confirmations
 ADD CONSTRAINT payroll_confirmations_manual_exception_details_check
 CHECK (
  confirmation_method NOT IN ('manual_exception','salary_exception')
  OR (
   exception_reason IS NOT NULL AND length(btrim(exception_reason)) BETWEEN 5 AND 500
   AND confirmed_amount > 0
   AND (
    (confirmation_method='manual_exception' AND confirmed_minutes>=0 AND work_days>=1)
    OR (confirmation_method='salary_exception' AND confirmed_minutes=0 AND work_days=0)
   )
  )
 );
COMMENT ON COLUMN public.payroll_confirmations.confirmation_method IS
 'normal=ordinary approval; manual_exception=verified hours/days/amount; salary_exception=owner-verified fixed salary with uncertified work-time fields (0/0)';
