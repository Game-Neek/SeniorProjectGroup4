
-- Add file_path column to course_textbooks
ALTER TABLE public.course_textbooks ADD COLUMN file_path text;

-- Create textbooks storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('textbooks', 'textbooks', false);

-- Storage RLS policies
CREATE POLICY "Users can upload their own textbooks"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'textbooks' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own textbooks"
ON storage.objects FOR SELECT
USING (bucket_id = 'textbooks' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own textbooks"
ON storage.objects FOR DELETE
USING (bucket_id = 'textbooks' AND auth.uid()::text = (storage.foldername(name))[1]);
