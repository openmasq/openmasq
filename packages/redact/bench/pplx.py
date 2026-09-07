#!/usr/bin/env python
"""Perplexity PII-Tracer's detections on a corpus — a column `compare.mts` replays without Python.

    python bench/pplx.py internal   -> bench/pplx.detections.json  (+ pplx.labels.json, pplx.timing.json)
    python bench/pplx.py external   -> bench/external/pplx.detections.json

    pnpm bench:compare --corpus internal --extra pplx=packages/redact/bench/pplx.detections.json

The model is `perplexity-ai/pplx-pii-masking` (MIT): a ~0.6B bidirectional Qwen3 encoder with a
BIOES token head over 9 PII types and a document sensitivity head, loaded through its own
`trust_remote_code` classes and called with its `predict(text)` — the way its card documents it,
no threshold tuned by us. Texts longer than its 4 096-token window are split on line boundaries
and the offsets re-based, so nothing is silently truncated. Same output shape as `presidio.py`:
`{ caseId: [detected values] }`; the labels and the per-case latency go to side files.

Environment (pinned, the versions the committed detections were produced with):
    python3.12 -m venv v && v/bin/pip install torch==<see pplx.timing.json> transformers safetensors
"""
import glob
import json
import os
import statistics
import sys
import time

import torch
from transformers import AutoModel

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = "perplexity-ai/pplx-pii-masking"
which = sys.argv[1] if len(sys.argv) > 1 else "internal"

if which == "external":
    cases = json.load(open(os.path.join(HERE, "external", "presidio-research.benchcase.json")))
    out_dir = os.path.join(HERE, "external")
elif which == "internal":
    cases = []
    for f in sorted(glob.glob(os.path.join(HERE, "corpora", "*.json"))):
        cases += [c for c in json.load(open(f)) if isinstance(c.get("truth"), list)]
    out_dir = HERE
else:
    sys.exit("usage: pplx.py external|internal")

device = "mps" if torch.backends.mps.is_available() else "cpu"
dtype = torch.bfloat16 if device == "mps" else torch.float32
t_load = time.time()
model = AutoModel.from_pretrained(MODEL, trust_remote_code=True, torch_dtype=dtype).to(device).eval()
tok = model.tokenizer
load_s = time.time() - t_load
print(f"model loaded on {device} ({dtype}) in {load_s:.0f}s", file=sys.stderr)

WINDOW = model.config.max_seq_len - 64  # headroom for special tokens

def chunks(text):
    """(offset, piece) pairs that each fit the window; split on newlines, never mid-line."""
    if len(tok(text)["input_ids"]) <= WINDOW:
        yield 0, text
        return
    pos, buf, buf_start = 0, [], 0
    for line in text.splitlines(keepends=True):
        cand = "".join(buf) + line
        if buf and len(tok(cand)["input_ids"]) > WINDOW:
            yield buf_start, "".join(buf)
            buf, buf_start = [], pos
        buf.append(line)
        pos += len(line)
    if buf:
        yield buf_start, "".join(buf)

out, labels, timing = {}, {}, {}
t0 = time.time()
for i, c in enumerate(cases):
    text = c["text"]
    t1 = time.perf_counter()
    vals, labs, sens = [], [], 0.0
    for off, piece in chunks(text):
        spans, s = model.predict(piece)
        sens = max(sens, s)
        for sp in spans:
            vals.append(text[off + sp.start: off + sp.end])
            labs.append([off + sp.start, off + sp.end, sp.label, round(float(sp.score), 3)])
    timing[c["id"]] = round((time.perf_counter() - t1) * 1000, 1)
    out[c["id"]] = vals
    labels[c["id"]] = {"sensitivity": round(sens, 3), "spans": labs}
    if i % 100 == 0:
        print(f"  {i}/{len(cases)} ({time.time() - t0:.0f}s)", file=sys.stderr)

ms = list(timing.values())
summary = {
    "model": MODEL, "device": device, "dtype": str(dtype), "torch": torch.__version__,
    "transformers": __import__("transformers").__version__, "cases": len(cases),
    "load_s": round(load_s, 1), "total_s": round(time.time() - t0, 1),
    "ms_median": round(statistics.median(ms), 1), "ms_p90": round(sorted(ms)[int(len(ms) * 0.9)], 1), "ms_max": round(max(ms), 1),
}
json.dump(out, open(os.path.join(out_dir, "pplx.detections.json"), "w"), ensure_ascii=False, indent=1)
json.dump(labels, open(os.path.join(out_dir, "pplx.labels.json"), "w"), ensure_ascii=False, indent=1)
json.dump({"summary": summary, "per_case_ms": timing}, open(os.path.join(out_dir, "pplx.timing.json"), "w"), indent=1)
print(json.dumps(summary, indent=1))
