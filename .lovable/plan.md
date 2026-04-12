

# Plan: F10.2 — Automated Policy & Content Change Notifications

## Summary
Build a system that automatically detects when syllabus data (grading policy, weekly schedule, learning objectives) or course content changes, and delivers real-time notifications to the student.

## How It Works

When a syllabus is re-uploaded or course content is updated, the system compares the new data against the previous version and generates specific notifications about what changed (e.g., "Grading policy updated for Math 101", "New topic added to Week 8 schedule").

## Implementation

### 1. Create an Edge Function: `detect-content-changes`
A new backend function that:
- Accepts the old and new syllabus/content data
- Compares `grading_policy`, `weekly_schedule`, `learning_objectives`, and `course_description`
- Returns a list of human-readable change descriptions
- Uses AI (Lovable AI Gateway) for smart diff summarization when changes are complex

### 2. Add Change Detection to Syllabus Upload Flow
In `SyllabusUpload.tsx` and `SyllabusOutline.tsx`, after a syllabus re-upload/re-parse:
- Fetch the previous syllabus data before overwriting
- Call the edge function with old vs new data
- Insert notifications into the `notifications` table with category `course_updates`

### 3. Add Change Detection to Course Content Updates
In `GeneratedCourse.tsx` or wherever content is regenerated:
- Detect when lesson content, exercises, or quiz questions change
- Insert a notification with details of what was updated

### 4. Add Two New Notification Sub-Categories
Add `policy_change` and `content_change` as display sub-types within the existing `course_updates` category:
- `📋 Policy Change` — grading weight changes, new policies, deadline shifts
- `📝 Content Update` — new lessons, modified exercises, schedule changes

These will appear in the existing notification bell, notifications page, and respect existing preferences (the `course_updates` toggle already controls this category).

### 5. Frontend Notification Enhancements
- Add the new sub-category icons/labels to `NotificationBell.tsx` and `NotificationsPage.tsx`
- Show a "What Changed" expandable detail in the notification body for policy updates
- Add a filter option for "Policy Changes" in the notifications page

## Files Changed
- **New**: `supabase/functions/detect-content-changes/index.ts`
- **Modified**: `src/components/SyllabusUpload.tsx` — add change detection before syllabus update
- **Modified**: `src/components/SyllabusOutline.tsx` — same change detection logic
- **Modified**: `src/components/NotificationBell.tsx` — add new sub-category icons
- **Modified**: `src/pages/NotificationsPage.tsx` — add new category labels/filters
- **Modified**: `src/components/NotificationPreferences.tsx` — add policy_change preference display

## No Database Changes Required
The existing `notifications` table already supports this via the `category`, `source_type`, `source_id`, and `body` columns. Change details go in `body`, source tracking uses `source_type = "syllabus"` and `source_id = syllabus UUID`.

