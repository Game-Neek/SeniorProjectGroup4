
-- Knowledge components: granular learning objectives mapped per course
CREATE TABLE public.knowledge_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  class_name text NOT NULL,
  objective text NOT NULL,
  source text NOT NULL DEFAULT 'syllabus',
  bloom_level text,
  parent_topic text,
  component_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Per-user mastery of each knowledge component
CREATE TABLE public.knowledge_mastery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  component_id uuid NOT NULL REFERENCES public.knowledge_components(id) ON DELETE CASCADE,
  mastery_score numeric NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  last_practiced_at timestamptz,
  mastery_level text NOT NULL DEFAULT 'not_started',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, component_id)
);

-- RLS for knowledge_components
ALTER TABLE public.knowledge_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own knowledge components" ON public.knowledge_components FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own knowledge components" ON public.knowledge_components FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own knowledge components" ON public.knowledge_components FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own knowledge components" ON public.knowledge_components FOR DELETE USING (auth.uid() = user_id);

-- RLS for knowledge_mastery
ALTER TABLE public.knowledge_mastery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own mastery" ON public.knowledge_mastery FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own mastery" ON public.knowledge_mastery FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own mastery" ON public.knowledge_mastery FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own mastery" ON public.knowledge_mastery FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at on knowledge_mastery
CREATE TRIGGER update_knowledge_mastery_updated_at
  BEFORE UPDATE ON public.knowledge_mastery
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
