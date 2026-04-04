
-- Transit routes table
CREATE TABLE public.transit_routes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  university_id UUID REFERENCES public.universities(id) ON DELETE CASCADE,
  route_name TEXT NOT NULL,
  route_type TEXT NOT NULL DEFAULT 'shuttle' CHECK (route_type IN ('shuttle', 'metro')),
  color TEXT NOT NULL DEFAULT '#3B82F6',
  operating_hours TEXT NOT NULL DEFAULT '7:00 AM - 10:00 PM',
  frequency_minutes INTEGER NOT NULL DEFAULT 15,
  days_of_week TEXT[] NOT NULL DEFAULT '{Monday,Tuesday,Wednesday,Thursday,Friday}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transit_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view transit routes"
ON public.transit_routes FOR SELECT TO authenticated
USING (true);

-- Transit stops table
CREATE TABLE public.transit_stops (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id UUID NOT NULL REFERENCES public.transit_routes(id) ON DELETE CASCADE,
  stop_name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  stop_order INTEGER NOT NULL DEFAULT 0,
  arrival_offset_minutes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transit_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view transit stops"
ON public.transit_stops FOR SELECT TO authenticated
USING (true);

-- Indexes
CREATE INDEX idx_transit_routes_university ON public.transit_routes (university_id);
CREATE INDEX idx_transit_routes_type ON public.transit_routes (route_type);
CREATE INDEX idx_transit_stops_route ON public.transit_stops (route_id);

-- Seed: sample shuttle routes (no university_id = available to all for demo)
INSERT INTO public.transit_routes (route_name, route_type, color, operating_hours, frequency_minutes, days_of_week, is_active) VALUES
  ('Campus Loop', 'shuttle', '#10B981', '7:00 AM - 10:00 PM', 10, '{Monday,Tuesday,Wednesday,Thursday,Friday}', true),
  ('North Express', 'shuttle', '#F59E0B', '8:00 AM - 6:00 PM', 20, '{Monday,Tuesday,Wednesday,Thursday,Friday}', true),
  ('Weekend Connector', 'shuttle', '#8B5CF6', '10:00 AM - 8:00 PM', 30, '{Saturday,Sunday}', true),
  ('Red Line', 'metro', '#EF4444', '5:00 AM - 12:00 AM', 8, '{Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday}', true),
  ('Blue Line', 'metro', '#3B82F6', '5:30 AM - 11:30 PM', 10, '{Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday}', true);

-- Seed stops for Campus Loop
INSERT INTO public.transit_stops (route_id, stop_name, latitude, longitude, stop_order, arrival_offset_minutes)
SELECT id, stop_name, lat, lng, ord, offset_min
FROM public.transit_routes, (VALUES
  ('Main Library', 40.7580, -73.9855, 1, 0),
  ('Student Union', 40.7590, -73.9840, 2, 3),
  ('Science Complex', 40.7605, -73.9830, 3, 7),
  ('Athletic Center', 40.7615, -73.9850, 4, 12),
  ('Residence Halls', 40.7595, -73.9870, 5, 16),
  ('Main Library', 40.7580, -73.9855, 6, 20)
) AS s(stop_name, lat, lng, ord, offset_min)
WHERE route_name = 'Campus Loop';

-- Seed stops for North Express
INSERT INTO public.transit_stops (route_id, stop_name, latitude, longitude, stop_order, arrival_offset_minutes)
SELECT id, stop_name, lat, lng, ord, offset_min
FROM public.transit_routes, (VALUES
  ('South Gate', 40.7560, -73.9860, 1, 0),
  ('Medical Center', 40.7620, -73.9835, 2, 5),
  ('North Campus', 40.7650, -73.9820, 3, 12),
  ('Research Park', 40.7670, -73.9810, 4, 18)
) AS s(stop_name, lat, lng, ord, offset_min)
WHERE route_name = 'North Express';

-- Seed stops for Red Line (metro)
INSERT INTO public.transit_stops (route_id, stop_name, latitude, longitude, stop_order, arrival_offset_minutes)
SELECT id, stop_name, lat, lng, ord, offset_min
FROM public.transit_routes, (VALUES
  ('Downtown Central', 40.7505, -73.9935, 1, 0),
  ('University Station', 40.7555, -73.9880, 2, 4),
  ('Campus South', 40.7580, -73.9860, 3, 7),
  ('Midtown North', 40.7630, -73.9810, 4, 11),
  ('Uptown Terminal', 40.7690, -73.9780, 5, 16)
) AS s(stop_name, lat, lng, ord, offset_min)
WHERE route_name = 'Red Line';

-- Seed stops for Blue Line (metro)
INSERT INTO public.transit_stops (route_id, stop_name, latitude, longitude, stop_order, arrival_offset_minutes)
SELECT id, stop_name, lat, lng, ord, offset_min
FROM public.transit_routes, (VALUES
  ('West Terminal', 40.7540, -73.9950, 1, 0),
  ('Civic Center', 40.7560, -73.9910, 2, 5),
  ('Campus West', 40.7575, -73.9870, 3, 9),
  ('East Village', 40.7590, -73.9830, 4, 14),
  ('East Terminal', 40.7610, -73.9790, 5, 19)
) AS s(stop_name, lat, lng, ord, offset_min)
WHERE route_name = 'Blue Line';
