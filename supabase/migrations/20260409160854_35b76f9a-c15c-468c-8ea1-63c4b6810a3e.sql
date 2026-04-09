
-- Digital rubrics table
CREATE TABLE public.rubrics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  class_name text NOT NULL,
  title text NOT NULL,
  description text,
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  bloom_level text,
  source text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'draft',
  learning_objectives text[] DEFAULT '{}'::text[],
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.rubrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own rubrics" ON public.rubrics FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own rubrics" ON public.rubrics FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own rubrics" ON public.rubrics FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own rubrics" ON public.rubrics FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Rubric criteria table
CREATE TABLE public.rubric_criteria (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rubric_id uuid NOT NULL REFERENCES public.rubrics(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  criterion_name text NOT NULL,
  description text,
  weight numeric NOT NULL DEFAULT 1,
  criterion_order integer NOT NULL DEFAULT 0,
  performance_levels jsonb NOT NULL DEFAULT '[
    {"level": "Exemplary", "score": 4, "description": ""},
    {"level": "Proficient", "score": 3, "description": ""},
    {"level": "Developing", "score": 2, "description": ""},
    {"level": "Beginning", "score": 1, "description": ""}
  ]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.rubric_criteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own criteria" ON public.rubric_criteria FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own criteria" ON public.rubric_criteria FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own criteria" ON public.rubric_criteria FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own criteria" ON public.rubric_criteria FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Assignment examples table
CREATE TABLE public.assignment_examples (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rubric_id uuid NOT NULL REFERENCES public.rubrics(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  example_content text NOT NULL DEFAULT '',
  quality_level text NOT NULL DEFAULT 'proficient',
  annotations jsonb NOT NULL DEFAULT '[]'::jsonb,
  learning_objectives text[] DEFAULT '{}'::text[],
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.assignment_examples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own examples" ON public.assignment_examples FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own examples" ON public.assignment_examples FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own examples" ON public.assignment_examples FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own examples" ON public.assignment_examples FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_rubrics_class ON public.rubrics (user_id, class_name);
CREATE INDEX idx_rubric_criteria_rubric ON public.rubric_criteria (rubric_id);
CREATE INDEX idx_assignment_examples_rubric ON public.assignment_examples (rubric_id);

-- Triggers for updated_at
CREATE TRIGGER update_rubrics_updated_at BEFORE UPDATE ON public.rubrics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_rubric_criteria_updated_at BEFORE UPDATE ON public.rubric_criteria FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_assignment_examples_updated_at BEFORE UPDATE ON public.assignment_examples FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
