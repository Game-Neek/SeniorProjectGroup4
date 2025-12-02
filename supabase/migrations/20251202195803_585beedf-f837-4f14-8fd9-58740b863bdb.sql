-- Add Canva connection fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN canva_access_token text,
ADD COLUMN canva_refresh_token text,
ADD COLUMN canva_connected_at timestamp with time zone;