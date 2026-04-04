
CREATE TABLE public.content_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id UUID NOT NULL,
  reviewer_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'revision_requested', 'rejected')),
  accuracy_score INTEGER CHECK (accuracy_score BETWEEN 1 AND 5),
  alignment_score INTEGER CHECK (alignment_score BETWEEN 1 AND 5),
  bloom_match_score INTEGER CHECK (bloom_match_score BETWEEN 1 AND 5),
  pedagogy_score INTEGER CHECK (pedagogy_score BETWEEN 1 AND 5),
  inclusivity_score INTEGER CHECK (inclusivity_score BETWEEN 1 AND 5),
  overall_comments TEXT,
  inline_annotations JSONB DEFAULT '[]'::jsonb,
  revision_notes TEXT,
  syllabus_objectives_checked TEXT[] DEFAULT '{}'::text[],
  objectives_covered INTEGER DEFAULT 0,
  objectives_total INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.content_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reviews"
  ON public.content_reviews FOR SELECT TO authenticated
  USING (reviewer_id = auth.uid());

CREATE POLICY "Users can insert their own reviews"
  ON public.content_reviews FOR INSERT TO authenticated
  WITH CHECK (reviewer_id = auth.uid());

CREATE POLICY "Users can update their own reviews"
  ON public.content_reviews FOR UPDATE TO authenticated
  USING (reviewer_id = auth.uid());

CREATE POLICY "Users can delete their own reviews"
  ON public.content_reviews FOR DELETE TO authenticated
  USING (reviewer_id = auth.uid());

CREATE POLICY "Content owners can view reviews"
  ON public.content_reviews FOR SELECT TO authenticated
  USING (
    content_id IN (
      SELECT id FROM public.course_content WHERE user_id = auth.uid()
    )
  );
