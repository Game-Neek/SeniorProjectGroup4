-- Create table to store generated resource content by learning style
CREATE TABLE public.generated_resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  resource_type TEXT NOT NULL,
  resource_title TEXT NOT NULL,
  topic TEXT NOT NULL,
  learning_styles TEXT[] NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  usage_count INTEGER DEFAULT 1
);

-- Create unique index on resource lookup combination
CREATE UNIQUE INDEX idx_generated_resources_lookup 
ON public.generated_resources (resource_type, resource_title, topic, learning_styles);

-- Create index for faster learning style searches
CREATE INDEX idx_generated_resources_styles 
ON public.generated_resources USING GIN (learning_styles);

-- Enable RLS
ALTER TABLE public.generated_resources ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read cached resources (they're meant to be shared)
CREATE POLICY "Anyone can view generated resources" 
ON public.generated_resources 
FOR SELECT 
USING (true);

-- Only backend (service role) can insert/update resources
-- This is handled via service_role key in edge function

-- Add trigger for updated_at
CREATE TRIGGER update_generated_resources_updated_at
BEFORE UPDATE ON public.generated_resources
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();