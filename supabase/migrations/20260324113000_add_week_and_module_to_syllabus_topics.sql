ALTER TABLE public.syllabus_topics
ADD COLUMN IF NOT EXISTS week_number INTEGER,
ADD COLUMN IF NOT EXISTS module_title TEXT;
