
CREATE TABLE public.course_textbooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  class_name TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  isbn TEXT,
  requirement_type TEXT NOT NULL DEFAULT 'required',
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.course_textbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own textbooks" ON public.course_textbooks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own textbooks" ON public.course_textbooks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own textbooks" ON public.course_textbooks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own textbooks" ON public.course_textbooks FOR DELETE USING (auth.uid() = user_id);
