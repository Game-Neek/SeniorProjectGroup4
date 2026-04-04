
-- Add missing UPDATE policies on storage objects so users can replace their own files
CREATE POLICY "Users can update their own syllabi files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'syllabi' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own assignment files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'assignments' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- Ensure parsed_content in syllabi/assignments cannot be read by other users
-- (Already enforced by existing RLS, but adding explicit comment for audit trail)

-- Add an index on syllabi.user_id and assignments.user_id for faster RLS checks
CREATE INDEX IF NOT EXISTS idx_syllabi_user_id ON public.syllabi (user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_user_id ON public.assignments (user_id);

-- Add index on audit_logs for faster user-scoped queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
