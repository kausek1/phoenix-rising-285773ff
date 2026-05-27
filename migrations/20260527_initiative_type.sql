-- Add initiative_type to distinguish raw "ideas" from full LBCs.
-- Existing rows default to 'lbc'. Ideas have display_id = NULL until promoted.

ALTER TABLE public.initiatives
  ADD COLUMN IF NOT EXISTS initiative_type text NOT NULL DEFAULT 'lbc';

ALTER TABLE public.initiatives
  ALTER COLUMN display_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'initiatives_initiative_type_check'
  ) THEN
    ALTER TABLE public.initiatives
      ADD CONSTRAINT initiatives_initiative_type_check
      CHECK (initiative_type IN ('lbc', 'idea'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS initiatives_initiative_type_idx
  ON public.initiatives (client_id, initiative_type);
