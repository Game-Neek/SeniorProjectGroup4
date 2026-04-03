import { supabase } from "@/integrations/supabase/client";

// ── File-type validation maps ──────────────────────────────────────
const MIME_MAP: Record<string, string[]> = {
  ".pdf":  ["application/pdf"],
  ".doc":  ["application/msword"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".ppt":  ["application/vnd.ms-powerpoint"],
  ".pptx": ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ".xls":  ["application/vnd.ms-excel"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ".txt":  ["text/plain"],
  ".csv":  ["text/csv"],
  ".png":  ["image/png"],
  ".jpg":  ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
};

export interface FileValidationOptions {
  /** Allowed extensions including the dot, e.g. [".pdf", ".docx"] */
  allowedExtensions: string[];
  /** Max size in bytes (default 20 MB) */
  maxSizeBytes?: number;
}

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate file type (extension + MIME) and size.
 */
export function validateFile(
  file: File,
  options: FileValidationOptions
): FileValidationResult {
  const { allowedExtensions, maxSizeBytes = 20 * 1024 * 1024 } = options;

  // Extension check
  const ext = getExtension(file.name);
  if (!allowedExtensions.includes(ext)) {
    return {
      valid: false,
      error: `Unsupported file type "${ext}". Allowed: ${allowedExtensions.join(", ")}`,
    };
  }

  // MIME check (lenient – some browsers report empty MIME)
  if (file.type) {
    const acceptedMimes = MIME_MAP[ext] ?? [];
    if (acceptedMimes.length > 0 && !acceptedMimes.includes(file.type)) {
      return {
        valid: false,
        error: `File MIME type "${file.type}" does not match expected type for ${ext} files.`,
      };
    }
  }

  // Size check
  if (file.size > maxSizeBytes) {
    const maxMB = (maxSizeBytes / (1024 * 1024)).toFixed(0);
    return { valid: false, error: `File exceeds the ${maxMB} MB size limit.` };
  }

  if (file.size === 0) {
    return { valid: false, error: "File is empty." };
  }

  return { valid: true };
}

// ── Collision-safe path generation ─────────────────────────────────
function getExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

/**
 * Build a storage path that is practically collision-proof even under
 * thousands of concurrent uploads: userId / timestamp-random-sanitisedName
 */
export function buildStoragePath(userId: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128);
  const rand = crypto.randomUUID().slice(0, 8);
  return `${userId}/${Date.now()}-${rand}-${safe}`;
}

// ── Retry wrapper ──────────────────────────────────────────────────
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 500
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, delayMs * 2 ** attempt));
      }
    }
  }
  throw lastError;
}

// ── Core upload with retry ─────────────────────────────────────────
export interface UploadResult {
  filePath: string;
}

/**
 * Upload a single file to a Supabase storage bucket with automatic
 * retry (exponential back-off, 3 attempts).
 */
export async function uploadFile(
  bucket: string,
  userId: string,
  file: File
): Promise<UploadResult> {
  const filePath = buildStoragePath(userId, file.name);

  await withRetry(async () => {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, { upsert: false });
    if (error) throw error;
  });

  return { filePath };
}

// ── Concurrent upload queue ────────────────────────────────────────
export interface QueuedUpload<T> {
  file: File;
  /** Called after the file is uploaded; receives the storage path. */
  onUploaded: (filePath: string) => Promise<T>;
}

export interface QueueResult<T> {
  succeeded: T[];
  failed: { file: File; error: string }[];
}

/**
 * Process many uploads with bounded concurrency so the browser and
 * backend stay responsive even with hundreds/thousands of files.
 *
 * @param concurrency  max parallel uploads (default 6)
 */
export async function uploadQueue<T>(
  bucket: string,
  userId: string,
  items: QueuedUpload<T>[],
  validationOpts: FileValidationOptions,
  concurrency = 6,
  onProgress?: (done: number, total: number) => void
): Promise<QueueResult<T>> {
  const succeeded: T[] = [];
  const failed: QueueResult<T>["failed"] = [];
  let doneCount = 0;
  const total = items.length;

  // Pre-validate all files first (fast, synchronous)
  const validated = items.map((item) => ({
    ...item,
    validation: validateFile(item.file, validationOpts),
  }));

  for (const v of validated) {
    if (!v.validation.valid) {
      failed.push({ file: v.file, error: v.validation.error! });
      doneCount++;
      onProgress?.(doneCount, total);
    }
  }

  const valid = validated.filter((v) => v.validation.valid);

  // Process in bounded-concurrency batches
  const execute = async (item: (typeof valid)[number]) => {
    try {
      const { filePath } = await uploadFile(bucket, userId, item.file);
      const result = await item.onUploaded(filePath);
      succeeded.push(result);
    } catch (err) {
      failed.push({
        file: item.file,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      doneCount++;
      onProgress?.(doneCount, total);
    }
  };

  // Semaphore-style concurrency
  const running: Promise<void>[] = [];
  for (const item of valid) {
    const p = execute(item);
    running.push(p);
    if (running.length >= concurrency) {
      await Promise.race(running);
      // Remove settled promises
      for (let i = running.length - 1; i >= 0; i--) {
        const status = await Promise.race([
          running[i].then(() => "done"),
          Promise.resolve("pending"),
        ]);
        if (status === "done") running.splice(i, 1);
      }
    }
  }
  await Promise.all(running);

  return { succeeded, failed };
}

// ── Pre-defined validation presets ─────────────────────────────────
export const SYLLABUS_VALIDATION: FileValidationOptions = {
  allowedExtensions: [".pdf", ".doc", ".docx", ".ppt", ".pptx"],
  maxSizeBytes: 20 * 1024 * 1024,
};

export const ASSIGNMENT_VALIDATION: FileValidationOptions = {
  allowedExtensions: [".pdf", ".doc", ".docx"],
  maxSizeBytes: 10 * 1024 * 1024,
};
