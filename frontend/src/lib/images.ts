import { IMAGE_UPLOAD_TYPES, MAX_IMAGE_UPLOAD_BYTES } from '@planner/shared';

/** Value for a file input's `accept` attribute. */
export const IMAGE_ACCEPT = IMAGE_UPLOAD_TYPES.join(',');

/** Checks a chosen file before uploading; returns a message, or null when it's fine. */
export function validateImageFile(file: File): string | null {
  if (!(IMAGE_UPLOAD_TYPES as readonly string[]).includes(file.type)) {
    return 'Use a PNG, JPEG, WebP or GIF image';
  }
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) return 'Images can be at most 5 MB';
  return null;
}
