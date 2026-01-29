-- Create syllabi table to store uploaded syllabi
CREATE TABLE public.syllabi (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  class_id UUID REFERENCES public.user_classes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  file_name TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed BOOLEAN DEFAULT false,
  topics_extracted JSONB DEFAULT '[]'::jsonb
);

-- Enable RLS
ALTER TABLE public.syllabi ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own syllabi"
  ON public.syllabi FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own syllabi"
  ON public.syllabi FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own syllabi"
  ON public.syllabi FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own syllabi"
  ON public.syllabi FOR DELETE
  USING (auth.uid() = user_id);

-- Add index for faster lookups
CREATE INDEX idx_syllabi_user_id ON public.syllabi(user_id);
CREATE INDEX idx_syllabi_class_id ON public.syllabi(class_id);