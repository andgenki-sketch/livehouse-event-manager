-- Backwards-compatible: existing settlements keep an empty list; no sale amount changes.
ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS hall_deductions jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.settlements DROP CONSTRAINT IF EXISTS settlements_hall_deductions_array_check;
ALTER TABLE public.settlements
  ADD CONSTRAINT settlements_hall_deductions_array_check CHECK (jsonb_typeof(hall_deductions) = 'array');
