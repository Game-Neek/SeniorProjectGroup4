-- Create syllabus_topics table for storing AI-extracted topics from syllabi
CREATE TABLE public.syllabus_topics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  syllabus_id UUID NOT NULL REFERENCES public.syllabi(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  topic_order INTEGER NOT NULL DEFAULT 0,
  subtopics JSONB DEFAULT '[]'::jsonb,
  mastery_percent INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.syllabus_topics ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own syllabus topics"
  ON public.syllabus_topics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own syllabus topics"
  ON public.syllabus_topics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own syllabus topics"
  ON public.syllabus_topics FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own syllabus topics"
  ON public.syllabus_topics FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes for faster lookups
CREATE INDEX idx_syllabus_topics_syllabus_id ON public.syllabus_topics(syllabus_id);
CREATE INDEX idx_syllabus_topics_user_id ON public.syllabus_topics(user_id);
