-- Historical transit arrivals for predictive analytics
CREATE TABLE public.transit_arrival_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id uuid NOT NULL REFERENCES public.transit_routes(id) ON DELETE CASCADE,
  stop_id uuid NOT NULL REFERENCES public.transit_stops(id) ON DELETE CASCADE,
  scheduled_minutes integer NOT NULL DEFAULT 0,
  actual_minutes integer NOT NULL DEFAULT 0,
  delay_minutes integer NOT NULL DEFAULT 0,
  day_of_week integer NOT NULL DEFAULT 0,
  hour_of_day integer NOT NULL DEFAULT 0,
  data_source text NOT NULL DEFAULT 'simulated',
  recorded_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.transit_arrival_history ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read history for analytics
CREATE POLICY "Authenticated users can view transit history"
  ON public.transit_arrival_history FOR SELECT
  TO authenticated
  USING (true);

-- Service role writes history
CREATE POLICY "Service role can insert transit history"
  ON public.transit_arrival_history FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can delete old transit history"
  ON public.transit_arrival_history FOR DELETE
  TO service_role
  USING (true);

-- Indexes for efficient pattern queries
CREATE INDEX idx_transit_history_route_stop ON public.transit_arrival_history (route_id, stop_id);
CREATE INDEX idx_transit_history_patterns ON public.transit_arrival_history (route_id, stop_id, day_of_week, hour_of_day);
CREATE INDEX idx_transit_history_recorded ON public.transit_arrival_history (recorded_at DESC);