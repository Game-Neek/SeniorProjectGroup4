
-- Daily precomputed metrics table
CREATE TABLE public.daily_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  class_name text NOT NULL,
  metric_date date NOT NULL,
  events_count integer NOT NULL DEFAULT 0,
  quizzes_taken integer NOT NULL DEFAULT 0,
  avg_score numeric DEFAULT 0,
  exercises_completed integer NOT NULL DEFAULT 0,
  modules_completed integer NOT NULL DEFAULT 0,
  bloom_distribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  topics text[] NOT NULL DEFAULT '{}'::text[],
  completion_rate numeric DEFAULT 0,
  avg_latency_ms integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, class_name, metric_date)
);

CREATE INDEX idx_daily_metrics_user_date ON public.daily_metrics (user_id, class_name, metric_date DESC);
CREATE INDEX idx_daily_metrics_date ON public.daily_metrics (metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_performance_reports_type ON public.performance_reports (user_id, report_type, period_start DESC);

ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own daily metrics"
  ON public.daily_metrics FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own daily metrics"
  ON public.daily_metrics FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own daily metrics"
  ON public.daily_metrics FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own daily metrics"
  ON public.daily_metrics FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Backfill function: recomputes daily_metrics from learning_events for a given user
CREATE OR REPLACE FUNCTION public.backfill_daily_metrics(p_user_id uuid, p_class_name text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rows_affected integer := 0;
  rec record;
BEGIN
  FOR rec IN
    SELECT
      le.user_id,
      le.class_name,
      le.created_at::date AS metric_date,
      count(*) AS events_count,
      count(*) FILTER (WHERE le.event_type IN ('quiz_attempt','quiz_completed')) AS quizzes_taken,
      coalesce(avg(CASE WHEN le.event_type IN ('quiz_attempt','quiz_completed') AND le.total > 0 THEN (le.score::numeric / le.total) * 100 END), 0) AS avg_score,
      count(*) FILTER (WHERE le.event_type = 'exercise_completed') AS exercises_completed,
      count(*) FILTER (WHERE le.event_type = 'module_completed') AS modules_completed,
      jsonb_object_agg(
        coalesce(le.bloom_level, 'unknown'),
        1
      ) FILTER (WHERE le.bloom_level IS NOT NULL) AS bloom_dist,
      array_agg(DISTINCT le.topic) FILTER (WHERE le.topic IS NOT NULL) AS topics,
      CASE WHEN count(*) > 0 THEN
        (count(*) FILTER (WHERE le.event_type LIKE '%completed%' OR le.outcome IN ('correct','pass')))::numeric / count(*) * 100
      ELSE 0 END AS completion_rate,
      coalesce(avg(le.latency_ms) FILTER (WHERE le.latency_ms IS NOT NULL), 0)::integer AS avg_latency_ms
    FROM public.learning_events le
    WHERE le.user_id = p_user_id
      AND (p_class_name IS NULL OR le.class_name = p_class_name)
    GROUP BY le.user_id, le.class_name, le.created_at::date
  LOOP
    INSERT INTO public.daily_metrics (user_id, class_name, metric_date, events_count, quizzes_taken, avg_score, exercises_completed, modules_completed, bloom_distribution, topics, completion_rate, avg_latency_ms)
    VALUES (rec.user_id, rec.class_name, rec.metric_date, rec.events_count, rec.quizzes_taken, rec.avg_score, rec.exercises_completed, rec.modules_completed, coalesce(rec.bloom_dist, '{}'::jsonb), coalesce(rec.topics, '{}'::text[]), rec.completion_rate, rec.avg_latency_ms)
    ON CONFLICT (user_id, class_name, metric_date) DO UPDATE SET
      events_count = EXCLUDED.events_count,
      quizzes_taken = EXCLUDED.quizzes_taken,
      avg_score = EXCLUDED.avg_score,
      exercises_completed = EXCLUDED.exercises_completed,
      modules_completed = EXCLUDED.modules_completed,
      bloom_distribution = EXCLUDED.bloom_distribution,
      topics = EXCLUDED.topics,
      completion_rate = EXCLUDED.completion_rate,
      avg_latency_ms = EXCLUDED.avg_latency_ms,
      updated_at = now();
    rows_affected := rows_affected + 1;
  END LOOP;
  RETURN rows_affected;
END;
$$;
