-- Rename Canva columns to Canvas for Canvas LMS integration
ALTER TABLE public.profiles 
  RENAME COLUMN canva_access_token TO canvas_access_token;

ALTER TABLE public.profiles 
  RENAME COLUMN canva_refresh_token TO canvas_refresh_token;

ALTER TABLE public.profiles 
  RENAME COLUMN canva_connected_at TO canvas_connected_at;

-- Add Canvas domain column (each institution has their own Canvas URL)
ALTER TABLE public.profiles 
  ADD COLUMN canvas_domain text;