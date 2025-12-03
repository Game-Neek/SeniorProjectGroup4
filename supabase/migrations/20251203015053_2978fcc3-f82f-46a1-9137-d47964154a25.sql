-- Create practice history table
CREATE TABLE public.practice_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  class_name TEXT NOT NULL,
  practice_type TEXT NOT NULL, -- 'mini-quiz' or 'exercise'
  score INTEGER,
  total INTEGER,
  topics_practiced TEXT[] DEFAULT '{}',
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

-- Enable RLS
ALTER TABLE public.practice_history ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own practice history"
ON public.practice_history
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own practice history"
ON public.practice_history
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own practice history"
ON public.practice_history
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_practice_history_user_class ON public.practice_history(user_id, class_name);
CREATE INDEX idx_practice_history_completed_at ON public.practice_history(completed_at DESC);