#!/usr/bin/env python
"""OpenAI Privacy Filter's spans on a span-level dataset — a column `run.mts` replays without Python.

    python spans/opf.py tab            -> spans/results/tab.opf.json
    python spans/opf.py nemotron 2000  -> the first 2000 cases only (a probe; the file says so)
    python spans/opf.py tab 40 --latency --device cpu   -> results/latency.opf.cpu.json

`openai/privacy-filter` is a token-classification model: 8 layers of a 128-expert mixture
routed 4 per token (1.5 B parameters, 50 M active), Apache 2.0, released April 2026. OpenAI
reports 96 % F1 on PII-Masking-300k — the `ai4privacy` column of this bench — so it is the one
external system whose published figure this bench can check on a corpus it already carries.

It accepts 131 k positions, far more than the 4 096 this script windows at. That ceiling never
binds: the longest case in any of these five corpora is 12 760 characters, so every text is
tagged in ONE pass and `chunks()` never splits. Read it as: this bench does not exercise the
long-context advantage, rather than that it suppresses it.

It is read through `AutoModelForTokenClassification` and its own `id2label`, with spans
recovered from the BIO tags rather than from a pipeline's aggregation: `aggregation_strategy`
merges on the model's word ids, which drops the leading character of a value whenever the
tokenizer glues it to the preceding punctuation. The tags are grouped here on the offset
mapping instead, so a span is exactly the characters the model tagged.

`--latency` measures ONLY the clock (no detections written) on the first N cases, one engine
at a time, a warm-up case excluded — the same protocol as `latency.mts` and `pplx.py`, so the
three files sit in one table. `--device` forces the torch device; the accuracy passes run on
`mps` (bfloat16, how the model ships) and `cpu` is what compares to the product's own CPU
path. The device is RECORDED in the file and printed beside every figure.

Its 8 categories (account number, address, email, person, phone, URL, date, secret) are
NARROWER than what these corpora annotate. That costs it recall in the all-labels view and
nothing in precision — a scope the bench never charges an engine for, exactly as for us.

Environment (the versions the committed detections were produced with are in the file):
    python3.12 -m venv v && v/bin/pip install torch transformers
"""
import json
import os
import platform
import statistics
import sys
import time

import torch
import transformers
from transformers import AutoModelForTokenClassification, AutoTokenizer

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = "openai/privacy-filter"
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
tok = AutoTokenizer.from_pretrained(MODEL)
model = AutoModelForTokenClassification.from_pretrained(MODEL, torch_dtype=dtype).to(device).eval()
ID2LABEL = model.config.id2label
print(f"model loaded on {device} ({dtype}) in {time.time() - t0:.0f}s · {len(ID2LABEL)} tags", file=sys.stderr)
# The tokenizer's own ceiling, minus the two special tokens it adds around every window.
WINDOW = min(getattr(tok, "model_max_length", 4096), 4096) - 2  # never reached; see above


def chunks(text):
    """Split on LINE boundaries when a text exceeds the window, and re-base the offsets.

    Same rule as `pplx.py`: a value is never cut mid-line, so a span lost to a split is a
    split the corpus forced, not one this script chose.
    """
    if len(tok(text, add_special_tokens=False)["input_ids"]) <= WINDOW:
        yield 0, text
        return
    pos, buf, start = 0, [], 0
    for line in text.splitlines(keepends=True):
        cand = "".join(buf) + line
        if buf and len(tok(cand, add_special_tokens=False)["input_ids"]) > WINDOW:
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


def tag_spans(piece):
    """[start, end, label, score] per tagged span, on the piece's own character offsets."""
    enc = tok(piece, return_offsets_mapping=True, return_tensors="pt", truncation=True,
              max_length=WINDOW + 2)
    offsets = enc.pop("offset_mapping")[0].tolist()
    with torch.no_grad():
        logits = model(**{k: v.to(device) for k, v in enc.items()}).logits[0].float()
    probs = logits.softmax(-1)
    best = probs.argmax(-1).tolist()
    scores = probs.max(-1).values.tolist()
    out = []
    def trim(sp):
        """Drop whitespace at a span's edges.

        This tokenizer folds the preceding space into a token, so a raw span reads ` Sen`
        and a marked space would count against precision as a false-positive character.
        PII-Tracer's own `predict()` and Presidio both return trimmed offsets; this puts
        the three on the same footing rather than giving one an edge of whitespace.
        """
        a, b = sp[0], sp[1]
        while a < b and piece[a].isspace():
            a += 1
        while b > a and piece[b - 1].isspace():
            b -= 1
        return None if a >= b else [a, b, sp[2], sp[3]]

    for (a, b), tag_id, sc in zip(offsets, best, scores):
        if a == b:          # a special token carries no characters
            continue
        tag = ID2LABEL[tag_id]
        if tag in ("O", "o"):
            continue
        prefix, _, kind = tag.partition("-")
        kind = kind or tag
        # B/S opens a span; I/E/M continues one of the same kind that touches it. A tagger
        # without prefixes (plain kind labels) merges on the kind alone, which is the same rule.
        if out and out[-1][2] == kind and prefix.upper() not in ("B", "S") and a - out[-1][1] <= 1:
            out[-1][1] = b
            out[-1][3] = min(out[-1][3], round(sc, 3))
        else:
            out.append([a, b, kind, round(sc, 3)])
    return [t for t in (trim(sp) for sp in out) if t]


if latency_only:
    # One warm-up case, excluded — the first call pays for lazy kernels and page-ins.
    tag_spans(next(iter(chunks(cases[0]["text"])))[1])
    ms, chars = [], 0
    for c in cases[1:]:
        t = time.perf_counter()
        for _off, piece in chunks(c["text"]):
            tag_spans(piece)
        ms.append((time.perf_counter() - t) * 1000)
        chars += len(c["text"])
    lens = sorted(len(c["text"]) for c in cases[1:])
    row = {
        "dataset": dataset, "engine": "opf", "device": device.upper(),
        "runtime": f"python + torch {torch.__version__}", "numeric": str(dtype).replace("torch.", ""),
        "cases": len(ms), "medianChars": lens[len(lens) // 2],
        "median": round(statistics.median(ms), 1), "p90": round(sorted(ms)[int(0.9 * len(ms))], 1),
        "charsPerSec": round(1000 * chars / sum(ms)),
    }
    out_path = os.path.join(HERE, "results", f"latency.opf.{device}.json")
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
    for off, piece in chunks(c["text"]):
        for a, b, kind, sc in tag_spans(piece):
            spans.append([off + a, off + b, kind, sc])
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
    "engine": "opf", "dataset": dataset, "measured": time.strftime("%Y-%m-%d"),
    "host": f"{platform.system()} {platform.machine()} · {device} {dtype} · torch {torch.__version__} · transformers {transformers.__version__}",
    "cases": len(cases), "probe": bool(limit), "offsets": "utf16",
    "ms": {"median": round(statistics.median(ms), 1), "p90": round(sorted(ms)[int(0.9 * len(ms))], 1), "total": round(sum(ms))},
    "preds": preds, "labels": labels,
}
os.makedirs(os.path.join(HERE, "results"), exist_ok=True)
with open(os.path.join(HERE, "results", f"{dataset}.opf.json"), "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False)
print(f"{dataset}: {len(cases)} cases · median {res['ms']['median']} ms · p90 {res['ms']['p90']} ms", file=sys.stderr)
