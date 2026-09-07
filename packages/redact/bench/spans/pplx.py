#!/usr/bin/env python
"""Perplexity PII-Tracer's spans on a span-level dataset — a column `run.mts` replays without Python.

    python spans/pplx.py tab            -> spans/results/tab.pplx.json
    python spans/pplx.py nemotron 2000  -> the first 2000 cases only (a probe; the file says so)
    python spans/pplx.py tab 200 --latency --device cpu   -> results/latency.pplx.cpu.json

`--latency` measures ONLY the clock (no detections written) on the first N cases, one engine
at a time, a warm-up case excluded — the same protocol as `latency.mts`, so the two files can
sit in one table. `--device` forces the torch device: the accuracy passes run on `mps` (the
Apple GPU, bfloat16) because that is how this model ships, and `cpu` is what makes it
comparable to the product's own CPU path. The device is RECORDED in the file and must be
printed beside every figure — three things differ between those columns, not one.

    pnpm bench:spans --dataset tab --extra pplx=results/<dataset>.pplx.json

Same model, same loading and same window handling as `../pplx.py` (the value-level sidecar):
`perplexity-ai/pplx-pii-masking` through its own `predict(text)`, no threshold of ours; a text
over the 4 096-token window is split on line boundaries and the offsets re-based. Output has
the shape of `run.mts`'s result files, plus the label and score per span.
"""
import json
import os
import platform
import statistics
import sys
import time

import torch
from transformers import AutoModel

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = "perplexity-ai/pplx-pii-masking"
args = [a for a in sys.argv[1:] if not a.startswith("--")]
flags = {a for a in sys.argv[1:] if a.startswith("--")}
dataset = args[0]
limit = int(args[1]) if len(args) > 1 else 0
latency_only = "--latency" in flags
forced_device = next((a.split("=", 1)[1] for a in flags if a.startswith("--device=")), None)
if "--device" in flags:
    forced_device = sys.argv[sys.argv.index("--device") + 1]
cases = json.load(open(os.path.join(HERE, "data", f"{dataset}.spancase.json"), encoding="utf-8"))
if limit:
    cases = cases[:limit]

device = forced_device or ("mps" if torch.backends.mps.is_available() else "cpu")
dtype = torch.bfloat16 if device == "mps" else torch.float32
t0 = time.time()
model = AutoModel.from_pretrained(MODEL, trust_remote_code=True, torch_dtype=dtype).to(device).eval()
tok = model.tokenizer
print(f"model loaded on {device} ({dtype}) in {time.time() - t0:.0f}s", file=sys.stderr)
WINDOW = model.config.max_seq_len - 64

def chunks(text):
    if len(tok(text)["input_ids"]) <= WINDOW:
        yield 0, text
        return
    pos, buf, start = 0, [], 0
    for line in text.splitlines(keepends=True):
        cand = "".join(buf) + line
        if buf and len(tok(cand)["input_ids"]) > WINDOW:
            yield start, "".join(buf)
            start, buf = pos, [line]
        else:
            buf.append(line)
        pos += len(line)
    if buf:
        yield start, "".join(buf)

def utf16(text):
    """Code-point -> UTF-16 offsets (the scorer is JavaScript); None when they coincide."""
    if all(ord(ch) < 0x10000 for ch in text):
        return None
    m, pos = [0] * (len(text) + 1), 0
    for i, ch in enumerate(text):
        m[i] = pos
        pos += 2 if ord(ch) >= 0x10000 else 1
    m[len(text)] = pos
    return m

if latency_only:
    # One warm-up case, excluded — the first call pays for lazy kernels and page-ins.
    with torch.no_grad():
        model.predict(cases[0]["text"])
    ms, chars = [], 0
    for c in cases[1:]:
        t = time.perf_counter()
        with torch.no_grad():
            for _off, piece in chunks(c["text"]):
                model.predict(piece)
        ms.append((time.perf_counter() - t) * 1000)
        chars += len(c["text"])
    lens = sorted(len(c["text"]) for c in cases[1:])
    row = {
        "dataset": dataset, "engine": "pplx", "device": device.upper(),
        "runtime": f"python + torch {torch.__version__}", "numeric": str(dtype).replace("torch.", ""),
        "cases": len(ms), "medianChars": lens[len(lens) // 2],
        "median": round(statistics.median(ms), 1), "p90": round(sorted(ms)[int(0.9 * len(ms))], 1),
        "charsPerSec": round(1000 * chars / sum(ms)),
    }
    out_path = os.path.join(HERE, "results", f"latency.pplx.{device}.json")
    prev = json.load(open(out_path)) if os.path.exists(out_path) else {"rows": []}
    prev = {"host": f"{platform.system()} {platform.machine()} · {device} {dtype}", "sample": limit,
            "measured": time.strftime("%Y-%m-%d"),
            "rows": [r for r in prev.get("rows", []) if r["dataset"] != dataset] + [row]}
    os.makedirs(os.path.join(HERE, "results"), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(prev, f, ensure_ascii=False, indent=1)
    print(f"{dataset} · {device} · median {row['median']} ms · p90 {row['p90']} ms · {row['charsPerSec']} car/s", file=sys.stderr)
    raise SystemExit

preds, labels, ms = {}, {}, []
for i, c in enumerate(cases):
    t = time.perf_counter()
    spans = []
    with torch.no_grad():
        for off, piece in chunks(c["text"]):
            out, _sens = model.predict(piece)
            for s in out:
                spans.append([off + s.start, off + s.end, s.label, round(float(getattr(s, "score", 0.0) or 0.0), 3)])
    ms.append((time.perf_counter() - t) * 1000)
    m = utf16(c["text"])
    if m:
        spans = [[m[a], m[b], *rest] for a, b, *rest in spans]
    spans.sort()
    preds[c["id"]] = [[a, b] for a, b, *_ in spans]
    labels[c["id"]] = spans
    if (i + 1) % 200 == 0:
        print(f"  {i + 1}/{len(cases)} · median {statistics.median(ms):.0f} ms", file=sys.stderr)

res = {
    "engine": "pplx", "dataset": dataset, "measured": time.strftime("%Y-%m-%d"),
    "host": f"{platform.system()} {platform.machine()} · {device} {dtype} · torch {torch.__version__}",
    "cases": len(cases), "probe": bool(limit), "offsets": "utf16",
    "ms": {"median": round(statistics.median(ms), 1), "p90": round(sorted(ms)[int(0.9 * len(ms))], 1), "total": round(sum(ms))},
    "preds": preds, "labels": labels,
}
os.makedirs(os.path.join(HERE, "results"), exist_ok=True)
with open(os.path.join(HERE, "results", f"{dataset}.pplx.json"), "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False)
print(f"{dataset}: {len(cases)} cases · median {res['ms']['median']} ms · p90 {res['ms']['p90']} ms", file=sys.stderr)
