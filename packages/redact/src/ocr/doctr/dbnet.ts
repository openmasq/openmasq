// DBNet detection post-processing (straight pages) — faithful port of docTR's
// DBPostProcessor. logits → sigmoid → bitmap>bin_thresh → 8-connected components →
// per-blob axis-aligned bbox → mean-prob score (reject <box_thresh) → unclip(ratio) →
// remap to ORIGINAL pixels. Pure (no ONNX/canvas). Straight (axis-aligned) boxes only.
import type { DetPrep } from "./preprocess";
import { DET_SIZE } from "./preprocess";

const BIN_THRESH = 0.3;
const BOX_THRESH = 0.1;
const UNCLIP_RATIO = 1.5;
const MIN_SIZE = 2; // drop degenerate blobs (px, in the 1024 frame)

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** 8-connected component labelling via an explicit stack. Returns boxes in ORIGINAL px. */
export function dbnetBoxes(logits: Float32Array, prep: DetPrep): number[][] {
  const N = DET_SIZE;
  const prob = new Float32Array(N * N);
  const on = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const p = sigmoid(logits[i]);
    prob[i] = p;
    on[i] = p > BIN_THRESH ? 1 : 0;
  }

  const seen = new Uint8Array(N * N);
  const stack: number[] = [];
  const scaleX = prep.W / prep.newW;
  const scaleY = prep.H / prep.newH;
  const boxes: number[][] = [];

  for (let start = 0; start < N * N; start++) {
    if (!on[start] || seen[start]) continue;
    let minx = N,
      miny = N,
      maxx = -1,
      maxy = -1;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const idx = stack.pop() as number;
      const x = idx % N;
      const y = (idx - x) / N;
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (y < miny) miny = y;
      if (y > maxy) maxy = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= N) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= N) continue;
          const ni = ny * N + nx;
          if (on[ni] && !seen[ni]) {
            seen[ni] = 1;
            stack.push(ni);
          }
        }
      }
    }

    const w = maxx - minx;
    const h = maxy - miny;
    if (w < MIN_SIZE || h < MIN_SIZE) continue;

    // score = mean prob over the bbox rectangle (docTR box_score, straight pages)
    let sum = 0;
    let cnt = 0;
    for (let y = miny; y <= maxy; y++) {
      const row = y * N;
      for (let x = minx; x <= maxx; x++) {
        sum += prob[row + x];
        cnt++;
      }
    }
    if (cnt === 0 || sum / cnt < BOX_THRESH) continue;

    // unclip: distance = area * ratio / perimeter, expand each side (pyclipper on a rect)
    const area = w * h;
    const perim = 2 * (w + h);
    const d = perim > 0 ? (area * UNCLIP_RATIO) / perim : 0;
    const ex0 = minx - d;
    const ey0 = miny - d;
    const ex1 = maxx + d;
    const ey1 = maxy + d;

    // remove symmetric pad, scale to original px, clamp
    let ox0 = (ex0 - prep.padLeft) * scaleX;
    let oy0 = (ey0 - prep.padTop) * scaleY;
    let ox1 = (ex1 - prep.padLeft) * scaleX;
    let oy1 = (ey1 - prep.padTop) * scaleY;
    ox0 = Math.max(0, Math.min(prep.W, ox0));
    oy0 = Math.max(0, Math.min(prep.H, oy0));
    ox1 = Math.max(0, Math.min(prep.W, ox1));
    oy1 = Math.max(0, Math.min(prep.H, oy1));
    if (ox1 - ox0 < 1 || oy1 - oy0 < 1) continue;
    boxes.push([ox0, oy0, ox1, oy1]);
  }
  return boxes;
}
