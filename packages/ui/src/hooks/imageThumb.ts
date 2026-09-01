/**
 * Shared image-preview helpers used by the library cards (`useFileThumb`) AND the inline
 * chat images (`useStoredImage`): turn stored bytes into a CSP-safe `data:` URL and
 * DOWNSCALE it to a light JPEG for display, so a 4000px multi-MB photo isn't decoded +
 * held at full resolution behind a small preview. The full original is only ever loaded
 * by the modal viewer.
 */

import { bytesToBase64 } from "../state/files/bytes";

/** Uint8Array → `data:` URL (CSP allows `img-src data:`, not `blob:`). */
export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  return `data:${mime || "image/*"};base64,${bytesToBase64(bytes)}`;
}

/** Downscale a full-size image `data:` URL to a lighter JPEG off a canvas. Falls back to
 *  the original when it's already small, the canvas is unavailable, or on any error — so a
 *  preview never disappears. Browser-only (uses `Image`/canvas). */
export async function downscaleDataUrl(
  fullUrl: string,
  maxEdge: number,
  quality: number,
): Promise<string> {
  if (typeof document === "undefined") return fullUrl;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const max = Math.max(img.naturalWidth, img.naturalHeight);
      if (!max || max <= maxEdge) return resolve(fullUrl); // already small enough
      const s = maxEdge / max;
      const w = Math.round(img.naturalWidth * s);
      const h = Math.round(img.naturalHeight * s);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(fullUrl);
      try {
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch {
        resolve(fullUrl);
      }
    };
    img.onerror = () => resolve(fullUrl);
    img.src = fullUrl;
  });
}
