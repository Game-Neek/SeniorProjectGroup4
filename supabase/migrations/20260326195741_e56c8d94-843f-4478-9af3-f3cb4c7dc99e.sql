
-- Create assessment type enum
CREATE TYPE public.assessment_type AS ENUM ('summative', 'formative', 'pre_assessment', 'benchmark');

-- Add assessment columns to assignments table
ALTER TABLE public.assignments
  ADD COLUMN assessment_type public.assessment_type,
  ADD COLUMN assessment_metadata jsonb DEFAULT '{}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.assignments.assessment_type IS 'Classification: summative (end-of-cycle), formative (ongoing feedback), pre_assessment (diagnostic), benchmark (periodic checkpoint)';
COMMENT ON COLUMN public.assignments.assessment_metadata IS 'Type-specific metadata: weight, rubric info, linked objectives, etc.';
