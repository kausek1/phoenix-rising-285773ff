-- Add acceptance_criteria field to kanban_stories for story-level criteria editing.
ALTER TABLE public.kanban_stories
  ADD COLUMN IF NOT EXISTS acceptance_criteria text;
