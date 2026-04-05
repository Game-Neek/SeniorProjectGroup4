
-- Focus areas derived from syllabus topics with progression tracking
CREATE TABLE public.study_focus_areas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  class_name text NOT NULL,
  topic text NOT NULL,
  topic_order integer NOT NULL DEFAULT 0,
  is_unlocked boolean NOT NULL DEFAULT false,
  quiz_passed boolean NOT NULL DEFAULT false,
  quiz_score integer,
  quiz_threshold integer NOT NULL DEFAULT 70,
  estimated_time_minutes integer DEFAULT 60,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Learning modules within each focus area
CREATE TABLE public.study_modules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  focus_area_id uuid NOT NULL REFERENCES public.study_focus_areas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  module_type text NOT NULL DEFAULT 'concept',
  title text NOT NULL,
  description text,
  content text,
  module_order integer NOT NULL DEFAULT 0,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamp with time zone,
  estimated_time_minutes integer DEFAULT 15,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.study_focus_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_modules ENABLE ROW LEVEL SECURITY;

-- RLS for study_focus_areas
CREATE POLICY "Users can view their own focus areas" ON public.study_focus_areas FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own focus areas" ON public.study_focus_areas FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own focus areas" ON public.study_focus_areas FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own focus areas" ON public.study_focus_areas FOR DELETE USING (auth.uid() = user_id);

-- RLS for study_modules
CREATE POLICY "Users can view their own modules" ON public.study_modules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own modules" ON public.study_modules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own modules" ON public.study_modules FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own modules" ON public.study_modules FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_study_focus_areas_updated_at BEFORE UPDATE ON public.study_focus_areas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_study_modules_updated_at BEFORE UPDATE ON public.study_modules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
