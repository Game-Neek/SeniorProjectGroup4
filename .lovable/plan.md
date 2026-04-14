

## Plan: Add File Upload Option to Course Textbooks

### Overview
Add a two-mode "Add Textbook" dialog: users can either fill in details manually (current behavior) or upload a textbook file (PDF, DOCX, etc.) that gets stored in a new `textbooks` storage bucket. The uploaded file path is saved alongside the textbook record.

### Database Changes

1. **Add `file_path` column** to `course_textbooks` table (nullable text) to store the storage path of uploaded files.
2. **Create `textbooks` storage bucket** (private) with RLS policies allowing authenticated users to upload/read/delete their own files.

### UI Changes (CourseTextbooks.tsx)

1. **Add mode toggle** in the Add dialog — two tabs or segmented control: "Manual" and "Upload File".
2. **Manual tab** — keeps the current form (title, author, ISBN, type).
3. **Upload tab** — file input accepting `.pdf`, `.docx`, `.epub`, `.txt` plus a title field (auto-populated from filename) and requirement type selector. Uses the existing `uploadEngine.ts` for validation and upload to the `textbooks` bucket.
4. **Display file indicator** — textbooks with a `file_path` show a download/view button in the list row.
5. **Delete cleanup** — when deleting a textbook with a file, also remove the file from storage.

### Technical Details

- Reuse `validateFile` and upload patterns from `uploadEngine.ts`
- Storage path: `{user_id}/{class_name}/{filename}`
- File size limit: 20MB
- The `source` field will be set to `"uploaded"` for file-based entries
- Signed URL generation for viewing/downloading uploaded files

