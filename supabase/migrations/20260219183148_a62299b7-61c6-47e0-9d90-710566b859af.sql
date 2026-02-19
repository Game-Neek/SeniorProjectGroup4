
ALTER TABLE public.syllabi
ADD COLUMN parsed_content text NULL,
ADD COLUMN course_description text NULL,
ADD COLUMN learning_objectives text[] NULL,
ADD COLUMN weekly_schedule jsonb NULL,
ADD COLUMN grading_policy jsonb NULL,
ADD COLUMN required_materials text[] NULL,
ADD COLUMN parsed_at timestamp with time zone NULL;
