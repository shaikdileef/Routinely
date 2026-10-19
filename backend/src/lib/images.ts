import { MAX_IMAGE_UPLOAD_BYTES } from '@planner/shared';
import express from 'express';
import { AppError } from './errors.js';

/** Body parser for image uploads: the raw file, whatever Content-Type the client sent. */
export const rawImageBody = express.raw({ type: () => true, limit: MAX_IMAGE_UPLOAD_BYTES });

/** Identifies the image format from its leading bytes, ignoring whatever the client claims. */
export function detectImageType(data: Uint8Array): string | null {
  const startsWith = (bytes: number[], offset = 0) =>
    data.length >= offset + bytes.length && bytes.every((b, i) => data[offset + i] === b);

  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  return null;
}

/** Validates an uploaded body and returns it ready to store, with its real MIME type. */
export function parseImageUpload(data: unknown): {
  mimeType: string;
  bytes: Uint8Array<ArrayBuffer>;
} {
  if (!Buffer.isBuffer(data) || data.length === 0) {
    throw new AppError(400, 'EMPTY_IMAGE', 'Choose an image file to upload');
  }
  if (data.length > MAX_IMAGE_UPLOAD_BYTES) {
    throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'Images can be at most 5 MB');
  }
  const mimeType = detectImageType(data);
  if (!mimeType) {
    throw new AppError(415, 'UNSUPPORTED_IMAGE', 'Use a PNG, JPEG, WebP or GIF image');
  }
  return { mimeType, bytes: new Uint8Array(data) };
}

/** Image URLs carry a version (?v=), so each version can be cached for good. */
export const IMMUTABLE_CACHE = 'private, max-age=31536000, immutable';
