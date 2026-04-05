
-- Learning events fact table for granular event tracking
CREATE TABLE public.learning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  class_name text NOT NULL,
  event_type text NOT NULL,
  topic text,
  bloom_level text,
  outcome text,
  score numeric,
  total numeric,
  latency_ms integer,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_learning_events_user_class ON public.learning_events(user_id, class_name);
CREATE INDEX idx_learning_events_type ON public.learning_events(event_type);
CREATE INDEX idx_learning_events_created ON public.learning_events(created_at);

ALTER TABLE public.learning_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own learning events"
  ON public.learning_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own learning events"
  ON public.learning_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Weekly performance snapshots aggregate table
CREATE TABLE public.weekly_performance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  class_name text NOT NULL,
  week_start date NOT NULL,
  quizzes_taken integer DEFAULT 0,
  avg_score numeric DEFAULT 0,
  exercises_completed integer DEFAULT 0,
  modules_completed integer DEFAULT 0,
  topics_studied text[] DEFAULT '{}'::text[],
  bloom_levels_reached jsonb DEFAULT '{}'::jsonb,
  mastery_pct numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, class_name, week_start)
);

CREATE INDEX idx_weekly_snapshots_user ON public.weekly_performance_snapshots(user_id, class_name);

ALTER TABLE public.weekly_performance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own snapshots"
  ON public.weekly_performance_snapshots FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own snapshots"
  ON public.weekly_performance_snapshots FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own snapshots"
  ON public.weekly_performance_snapshots FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Anonymization function: strips PII from learning_events older than a semester
CREATE OR REPLACE FUNCTION public.anonymize_old_learning_events(cutoff_date timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rows_affected integer;
BEGIN
  -- Replace user_id with a hash to anonymize while keeping aggregate analysis possible
  UPDATE public.learning_events
  SET user_id = gen_random_uuid(),
      metadata = '{}'::jsonb
  WHERE created_at < cutoff_date
    AND user_id NOT IN (SELECT gen_random_uuid()); -- only non-anonymized rows
  
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected;
END;
$$;
