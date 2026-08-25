// Image preprocessing — faithful port of docTR's Resize + Normalize.
// Detection: aspect-preserving fit into 1024×1024 + SYMMETRIC pad, pad=0 then normalize.
// Recognition: aspect-preserving fit into 32×128 + RIGHT/BOTTOM pad (symmetric_pad=False).
// The `@napi-rs/canvas` module is INJECTED (loaded lazily by the engine) so this file
// stays dependency-free at import time.

/* eslint-disable @typescript-eslint/no-explicit-any */

// Detection input square. Fixed at 1024 (the static-shape exported det model). A different
// size would need the dynamic-axes model — out of scope for the desktop integration.
export const DET_SIZE = 1024;
export const DET_MEAN = [0.798, 0.785, 0.772];
export const DET_STD = [0.264, 0.2749, 0.287];
export const RECO_H = 32;
export const RECO_W = 128;
export const RECO_MEAN = [0.694, 0.695, 0.693];
export const RECO_STD = [0.299, 0.296, 0.301];

export interface DetPrep {
  data: Float32Array; // NCHW 1×3×1024×1024
  padLeft: number;
  padTop: number;
  newW: number;
  newH: number;
  W: number;
  H: number;
}

// docTR Resize (preserve_aspect_ratio): actual_ratio = H/W ; target_ratio = size[0]/size[1].
function fit(W: number, H: number, sizeH: number, sizeW: number): [number, number] {
  const actual = H / W;
  const target = sizeH / sizeW;
  if (actual > target) return [Math.max(Math.floor(sizeH / actual), 1), sizeH]; // [newW, newH]
  return [sizeW, Math.max(Math.floor(sizeW * actual), 1)];
}

export function preprocessDet(img: any, canvas: any): DetPrep {
  const W = img.width;
  const H = img.height;
  const [newW, newH] = fit(W, H, DET_SIZE, DET_SIZE);
  const padLeft = Math.ceil((DET_SIZE - newW) / 2); // symmetric, ceil on left/top (docTR)
  const padTop = Math.ceil((DET_SIZE - newH) / 2);

  const c = canvas.createCanvas(DET_SIZE, DET_SIZE);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, padLeft, padTop, newW, newH); // black (0) background = pad
  const rgba = ctx.getImageData(0, 0, DET_SIZE, DET_SIZE).data;

  const plane = DET_SIZE * DET_SIZE;
  const data = new Float32Array(3 * plane);
  for (let i = 0, px = 0; i < plane; i++, px += 4) {
    data[i] = (rgba[px] / 255 - DET_MEAN[0]) / DET_STD[0];
    data[plane + i] = (rgba[px + 1] / 255 - DET_MEAN[1]) / DET_STD[1];
    data[2 * plane + i] = (rgba[px + 2] / 255 - DET_MEAN[2]) / DET_STD[2];
  }
  return { data, padLeft, padTop, newW, newH, W, H };
}

// Crop a box from the ORIGINAL image, resize into 32×128 (pad right/bottom), normalize.
export function preprocessCrop(img: any, box: number[], out: Float32Array, offset: number, canvas: any): void {
  const [x0, y0, x1, y1] = box;
  const cw = Math.max(1, x1 - x0);
  const ch = Math.max(1, y1 - y0);
  const [newW, newH] = fit(cw, ch, RECO_H, RECO_W);

  const c = canvas.createCanvas(RECO_W, RECO_H);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, x0, y0, cw, ch, 0, 0, newW, newH); // top-left, pad right/bottom = 0
  const rgba = ctx.getImageData(0, 0, RECO_W, RECO_H).data;

  const plane = RECO_H * RECO_W;
  for (let i = 0, px = 0; i < plane; i++, px += 4) {
    out[offset + i] = (rgba[px] / 255 - RECO_MEAN[0]) / RECO_STD[0];
    out[offset + plane + i] = (rgba[px + 1] / 255 - RECO_MEAN[1]) / RECO_STD[1];
    out[offset + 2 * plane + i] = (rgba[px + 2] / 255 - RECO_MEAN[2]) / RECO_STD[2];
  }
}
