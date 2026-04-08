
-- Composite indexes for high-concurrency calendar queries
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_date ON public.calendar_events (user_id, event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_type_date ON public.calendar_events (user_id, event_type, event_date);

-- Index for learning_events velocity queries
CREATE INDEX IF NOT EXISTS idx_learning_events_user_created ON public.learning_events (user_id, created_at DESC);

-- Index for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications (user_id, is_read, created_at DESC);

-- Enable realtime for calendar_events so updates push to clients instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_events;
