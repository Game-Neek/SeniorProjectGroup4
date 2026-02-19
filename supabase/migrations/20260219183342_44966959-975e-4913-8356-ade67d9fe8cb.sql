
CREATE POLICY "Users can update their own syllabi"
ON public.syllabi
FOR UPDATE
USING (auth.uid() = user_id);
