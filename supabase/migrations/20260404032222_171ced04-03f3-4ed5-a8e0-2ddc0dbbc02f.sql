
CREATE TABLE public.transit_arrivals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id uuid REFERENCES public.transit_routes(id) ON DELETE CASCADE NOT NULL,
  stop_id uuid REFERENCES public.transit_stops(id) ON DELETE CASCADE NOT NULL,
  predicted_arrival_time timestamp with time zone NOT NULL,
  estimated_minutes integer NOT NULL DEFAULT 0,
  data_source text NOT NULL DEFAULT 'simulated',
  vehicle_id text,
  status text NOT NULL DEFAULT 'on_time',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.transit_arrivals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view transit arrivals"
  ON public.transit_arrivals
  FOR SELECT
  TO authenticated
  USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.transit_arrivals;
