
CREATE POLICY "Users can delete their own learning events"
  ON public.learning_events FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own snapshots"
  ON public.weekly_performance_snapshots FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
