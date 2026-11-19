-- Discussion decisions remain separate from measured cashflow figures.
-- This is an additive, nullable metadata migration: all existing amounts and review states remain unchanged.
ALTER TABLE public.cashflow_monthly
 ADD COLUMN IF NOT EXISTS discussion_topic text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS discussion_decision text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS discussion_assignee text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS discussion_deadline date;
COMMENT ON COLUMN public.cashflow_monthly.discussion_topic IS 'Agenda or decision requested for management discussion; not an AI-generated decision';
COMMENT ON COLUMN public.cashflow_monthly.discussion_decision IS 'Decision recorded by the owner after management discussion';
COMMENT ON COLUMN public.cashflow_monthly.discussion_assignee IS 'Person assigned to follow up on the recorded decision';
COMMENT ON COLUMN public.cashflow_monthly.discussion_deadline IS 'Follow-up deadline for the management decision';
