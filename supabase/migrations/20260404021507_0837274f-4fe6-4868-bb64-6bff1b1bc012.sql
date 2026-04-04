
CREATE TABLE public.bias_audits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id UUID NOT NULL,
  user_id UUID NOT NULL,
  overall_score INTEGER NOT NULL DEFAULT 0,
  gender_score INTEGER NOT NULL DEFAULT 0,
  racial_score INTEGER NOT NULL DEFAULT 0,
  socioeconomic_score INTEGER NOT NULL DEFAULT 0,
  language_score INTEGER NOT NULL DEFAULT 0,
  flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  auto_fixed BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bias_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view audits for their content"
  ON public.bias_audits FOR SELECT TO authenticated
  USING (content_id IN (SELECT id FROM course_content WHERE user_id = auth.uid()));

CREATE POLICY "Users can view their own audits"
  ON public.bias_audits FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own audits"
  ON public.bias_audits FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own audits"
  ON public.bias_audits FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
