
CREATE POLICY "Service role can insert transit arrivals"
  ON public.transit_arrivals
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can delete transit arrivals"
  ON public.transit_arrivals
  FOR DELETE
  TO service_role
  USING (true);
