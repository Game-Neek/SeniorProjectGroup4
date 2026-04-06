
-- Performance reports table for aggregated metrics
CREATE TABLE public.performance_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  class_name text NOT NULL,
  report_type text NOT NULL DEFAULT 'weekly',
  period_start date NOT NULL,
  period_end date NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_performance_reports_user ON public.performance_reports (user_id, class_name, report_type);
CREATE INDEX idx_performance_reports_period ON public.performance_reports (user_id, period_start DESC);

-- Enable RLS
ALTER TABLE public.performance_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reports"
  ON public.performance_reports FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own reports"
  ON public.performance_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reports"
  ON public.performance_reports FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add indexes on learning_events for reporting queries
CREATE INDEX IF NOT EXISTS idx_learning_events_class_type ON public.learning_events (user_id, class_name, event_type);
CREATE INDEX IF NOT EXISTS idx_learning_events_created ON public.learning_events (user_id, created_at DESC);

-- Add indexes on practice_history for reporting
CREATE INDEX IF NOT EXISTS idx_practice_history_class ON public.practice_history (user_id, class_name, completed_at DESC);
