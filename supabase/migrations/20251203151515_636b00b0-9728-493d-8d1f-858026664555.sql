-- Add learning_styles column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN learning_styles text[] DEFAULT NULL;

-- Add a comment explaining the column
COMMENT ON COLUMN public.profiles.learning_styles IS 'Array of learning style preferences identified from the learning style quiz';