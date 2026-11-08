-- Owner-only shift forecast assumptions, keyed by position and work period.
-- Existing shift schedules and payroll settings are not modified.
CREATE TABLE IF NOT EXISTS public.shift_labor_hour_rules (
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  position_name text NOT NULL,
  shift_kind text NOT NULL CHECK (shift_kind IN ('day','night','all','studioEarly','studioLate')),
  paid_hours numeric(5,2) NOT NULL CHECK (paid_hours >= 0 AND paid_hours <= 24),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, position_name, shift_kind),
  CONSTRAINT shift_labor_hour_rules_position_name_check CHECK (char_length(position_name) BETWEEN 1 AND 100)
);
ALTER TABLE public.shift_labor_hour_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shift_labor_hour_rules FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_labor_hour_rules TO authenticated;
CREATE POLICY shift_labor_hour_rules_select ON public.shift_labor_hour_rules
 FOR SELECT TO authenticated USING (public.is_team_owner(team_id));
CREATE POLICY shift_labor_hour_rules_insert ON public.shift_labor_hour_rules
 FOR INSERT TO authenticated WITH CHECK (public.is_team_owner(team_id));
CREATE POLICY shift_labor_hour_rules_update ON public.shift_labor_hour_rules
 FOR UPDATE TO authenticated USING (public.is_team_owner(team_id))
 WITH CHECK (public.is_team_owner(team_id));
CREATE POLICY shift_labor_hour_rules_delete ON public.shift_labor_hour_rules
 FOR DELETE TO authenticated USING (public.is_team_owner(team_id));
