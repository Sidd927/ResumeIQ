export const ACCEPTED_RESUME_EXTENSIONS = ['.pdf', '.docx'] as const;
/** Mirrors the backend's MAX_UPLOAD_BYTES (5 MB). */
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

/**
 * Client-side check run BEFORE uploading, so obviously wrong files never hit
 * the network. The backend re-validates (extension + magic bytes) regardless.
 * Returns a user-facing error message, or null if the file looks fine.
 */
export function validateResumeFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!ACCEPTED_RESUME_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return `"${file.name}" isn't supported. Upload a PDF or DOCX file.`;
  }
  if (file.size > MAX_RESUME_BYTES) {
    return 'That file is larger than 5 MB. Try exporting a smaller PDF.';
  }
  if (file.size === 0) {
    return 'That file is empty.';
  }
  return null;
}
