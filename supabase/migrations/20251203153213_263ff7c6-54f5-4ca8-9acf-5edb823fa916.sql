-- Create storage bucket for assignments
INSERT INTO storage.buckets (id, name, public)
VALUES ('assignments', 'assignments', false);

-- Storage policies for assignments bucket
CREATE POLICY "Users can upload their own assignments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'assignments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own assignments"
ON storage.objects FOR SELECT
USING (bucket_id = 'assignments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own assignments"
ON storage.objects FOR DELETE
USING (bucket_id = 'assignments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Create assignments table
CREATE TABLE public.assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  class_name TEXT NOT NULL,
  assignment_title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  due_date DATE,
  parsed_content TEXT,
  learning_objectives TEXT[],
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own assignments"
ON public.assignments FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own assignments"
ON public.assignments FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own assignments"
ON public.assignments FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own assignments"
ON public.assignments FOR DELETE
USING (auth.uid() = user_id);