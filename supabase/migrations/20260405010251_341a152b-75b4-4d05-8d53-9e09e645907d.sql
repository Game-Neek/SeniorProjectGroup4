DROP VIEW IF EXISTS public.profiles_safe;
CREATE VIEW public.profiles_safe
WITH (security_invoker = true) AS
SELECT id, email, full_name, university_id, learning_styles, canvas_domain, canvas_connected_at, created_at, updated_at
FROM public.profiles;