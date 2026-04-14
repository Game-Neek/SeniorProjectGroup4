-- Create course_textbooks table
CREATE TABLE public.course_textbooks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  syllabus_id UUID NOT NULL REFERENCES public.syllabi(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  edition TEXT,
  isbn TEXT,
  is_required BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for course_textbooks
ALTER TABLE public.course_textbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own course textbooks"
  ON public.course_textbooks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own course textbooks"
  ON public.course_textbooks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own course textbooks"
  ON public.course_textbooks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own course textbooks"
  ON public.course_textbooks FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_course_textbooks_syllabus_id ON public.course_textbooks(syllabus_id);
CREATE INDEX idx_course_textbooks_user_id ON public.course_textbooks(user_id);

-- Create course_events table
CREATE TABLE public.course_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  syllabus_id UUID NOT NULL REFERENCES public.syllabi(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL, -- e.g. homework, quiz, test, reading
  title TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for course_events
ALTER TABLE public.course_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own course events"
  ON public.course_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own course events"
  ON public.course_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own course events"
  ON public.course_events FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own course events"
  ON public.course_events FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_course_events_syllabus_id ON public.course_events(syllabus_id);
CREATE INDEX idx_course_events_user_id ON public.course_events(user_id);

-- Add columns to syllabus_topics
ALTER TABLE public.syllabus_topics
ADD COLUMN learning_objectives JSONB DEFAULT '[]'::jsonb,
ADD COLUMN blooms_taxonomy_level TEXT,
ADD COLUMN textbook_chapters JSONB DEFAULT '[]'::jsonb,
ADD COLUMN start_date TIMESTAMPTZ,
ADD COLUMN end_date TIMESTAMPTZ;
