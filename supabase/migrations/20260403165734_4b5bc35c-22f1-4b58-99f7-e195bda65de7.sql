
ALTER TABLE public.assignments 
  ADD COLUMN difficulty_level text DEFAULT NULL,
  ADD COLUMN irt_parameters jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN knowledge_dependencies text[] DEFAULT '{}'::text[],
  ADD COLUMN difficulty_analyzed_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.assignments.difficulty_level IS 'IRT-derived difficulty: novice, intermediate, advanced, expert';
COMMENT ON COLUMN public.assignments.irt_parameters IS 'Item Response Theory parameters: discrimination (a), difficulty (b), guessing (c), bloom_level, cognitive_load';
COMMENT ON COLUMN public.assignments.knowledge_dependencies IS 'Knowledge Space Theory prerequisite concepts';
