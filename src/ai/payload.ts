import type { ImagePayload } from './schemas';

/**
 * Request-size arithmetic for image uploads.
 *
 * This exists because the failure it prevents is invisible until it happens. A
 * modern phone camera produces 4–8 MB per photo; three of those base64-encoded is
 * a ~30 MB request that takes a minute on a basement wifi signal and then gets
 * rejected by the gateway's per-image cap. The owner sees a spinner, then an
 * error, and has no idea which part was too big.
 *
 * So the app measures before it sends, warns in the UI while photos are still
 * being added, and downscales on capture. Pure functions, kept away from the
 * capture code so the thresholds can be tested.
 */

/** Mirrors the gateway's own limits — see server/src/index.ts. */
export const MAX_IMAGES = 6;
export const MAX_IMAGE_BYTES = 5_000_000;
/** The API's hard request ceiling is 32 MB; stay well inside it. */
export const MAX_REQUEST_BYTES = 20_000_000;

/**
 * Target for on-device downscaling.
 *
 * 1600px on the long edge is comfortably enough to read a serial number off a
 * data plate — the limit on those photos is focus and glare, not resolution —
 * while cutting a typical capture to a few hundred kilobytes.
 */
export const RESIZE_LONG_EDGE = 1600;
export const RESIZE_QUALITY = 0.65;

/** Decoded byte size of a base64 string, accounting for padding. */
export function decodedBytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function imageBytes(image: Pick<ImagePayload, 'data'>): number {
  return decodedBytes(image.data);
}

export function totalBytes(images: Pick<ImagePayload, 'data'>[]): number {
  return images.reduce((sum, image) => sum + imageBytes(image), 0);
}

/** '1.4 MB' / '820 KB' — for telling someone why a request is slow. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type PayloadVerdict =
  | { ok: true; warning?: string; totalBytes: number }
  | { ok: false; reason: string; totalBytes: number };

/**
 * Whether a set of images can be sent, and what to tell the owner if not.
 *
 * Every message names the specific photo and the fix, because "request too large"
 * is not something a homeowner standing in a garage can act on.
 */
export function checkPayload(images: Pick<ImagePayload, 'data'>[]): PayloadVerdict {
  const total = totalBytes(images);

  if (images.length === 0) {
    return { ok: false, reason: 'Add at least one photo first.', totalBytes: 0 };
  }
  if (images.length > MAX_IMAGES) {
    return {
      ok: false,
      reason: `That's ${images.length} photos — send at most ${MAX_IMAGES} at a time. Remove a few and try again.`,
      totalBytes: total,
    };
  }

  const oversized = images.findIndex((image) => imageBytes(image) > MAX_IMAGE_BYTES);
  if (oversized >= 0) {
    return {
      ok: false,
      reason: `Photo ${oversized + 1} is ${formatBytes(imageBytes(images[oversized]!))}, over the ${formatBytes(MAX_IMAGE_BYTES)} limit. Retake it — photos taken in the app are resized automatically, but ones imported from your library may not be.`,
      totalBytes: total,
    };
  }

  if (total > MAX_REQUEST_BYTES) {
    return {
      ok: false,
      reason: `These photos total ${formatBytes(total)}, which is too much to send at once. Remove one or two and try again.`,
      totalBytes: total,
    };
  }

  // Still sendable, but worth setting expectations before they wait on it.
  if (total > MAX_REQUEST_BYTES / 2) {
    return {
      ok: true,
      warning: `${formatBytes(total)} to upload — this may take a moment on a weak signal.`,
      totalBytes: total,
    };
  }

  return { ok: true, totalBytes: total };
}
