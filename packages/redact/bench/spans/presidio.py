#!/usr/bin/env python
"""Presidio's spans on a span-level dataset — a column `run.mts` replays without Python.

    python spans/presidio.py tab            -> spans/results/tab.presidio.json
    python spans/presidio.py nemotron 2000  -> the first 2000 cases only
    python spans/presidio.py tab 40 --latency  -> results/latency.presidio.json

`--latency` measures ONLY the clock on the first N cases, one warm-up excluded — the same
protocol as `latency.mts` and `pplx.py --latency`, so the three files sit in one table. The
per-case timings inside the accuracy file are NOT that: they are taken while other engines are
measuring, and must never be charted as a response time.

DEFAULT `AnalyzerEngine` on purpose — predefined recognizers, score threshold 0,
`language="en"`. That is what a default install detects on the text a user actually has, and
it is the comparison a reader faces out of the box. It is NOT Presidio's ceiling: the library
exists to receive recognizers and models, and three of these corpora are multilingual while
this configuration reads only English. The README says so beside every number.

Unlike the value-level sidecar (`../presidio.py`), this one keeps OFFSETS: Presidio already
returns `start`/`end`, so nothing is re-located and nothing is guessed.

NRP detections are dropped: nationality/religion is out of scope on both sides.

Environment (pinned, the versions the committed detections were produced with):
    python3.12 -m venv v && v/bin/pip install presidio-analyzer==2.2.364 spacy==3.8.16
    v/bin/python -m spacy download en_core_web_lg
"""
import json
import os
import platform
import statistics
import sys
import time

import spacy
from presidio_analyzer import AnalyzerEngine

HERE = os.path.dirname(os.path.abspath(__file__))
args = [a for a in sys.argv[1:] if not a.startswith("--")]
dataset = args[0]
limit = int(args[1]) if len(args) > 1 else 0
latency_only = "--latency" in sys.argv
cases = json.load(open(os.path.join(HERE, "data", f"{dataset}.spancase.json"), encoding="utf-8"))
if limit:
    cases = cases[:limit]

analyzer = AnalyzerEngine()
DROP = {"NRP"}


def merge(spans):
    """Sorted, overlap-free — what every scorer expects."""
    out = []
    for a, b in sorted(spans):
        if out and a <= out[-1][1]:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return out


if latency_only:
    analyzer.analyze(text=cases[0]["text"], language="en")   # warm-up, excluded
    ms, chars = [], 0
    for c in cases[1:]:
        t = time.perf_counter()
        analyzer.analyze(text=c["text"], language="en")
        ms.append((time.perf_counter() - t) * 1000)
        chars += len(c["text"])
    lens = sorted(len(c["text"]) for c in cases[1:])
    row = {"dataset": dataset, "engine": "presidio", "device": "CPU",
           "runtime": f"presidio-analyzer 2.2.364 · spaCy {spacy.__version__}", "numeric": "—",
           "cases": len(ms), "medianChars": lens[len(lens) // 2],
           "median": round(statistics.median(ms), 1),
           "p90": round(sorted(ms)[int(0.9 * len(ms))], 1),
           "charsPerSec": round(1000 * chars / sum(ms))}
    out_path = os.path.join(HERE, "results", "latency.presidio.json")
    prev = json.load(open(out_path)) if os.path.exists(out_path) else {"rows": []}
    prev = {"host": f"{platform.system()} {platform.machine()} · CPU · en_core_web_lg",
            "sample": limit, "measured": time.strftime("%Y-%m-%d"),
            "rows": [r for r in prev.get("rows", []) if r["dataset"] != dataset] + [row]}
    os.makedirs(os.path.join(HERE, "results"), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(prev, f, ensure_ascii=False, indent=1)
    print(f"{dataset} · CPU · median {row['median']} ms · p90 {row['p90']} ms", file=sys.stderr)
    raise SystemExit

preds, ms = {}, []
for i, c in enumerate(cases):
    t = time.perf_counter()
    try:
        res = analyzer.analyze(text=c["text"], language="en")
    except Exception as e:                      # a malformed case must not lose the run
        print(f"  ! {c['id']}: {e}", file=sys.stderr)
        res = []
    ms.append((time.perf_counter() - t) * 1000)
    preds[c["id"]] = merge([(r.start, r.end) for r in res if r.entity_type not in DROP])
    if (i + 1) % 500 == 0:
        print(f"  {i + 1}/{len(cases)} · median {statistics.median(ms):.0f} ms", file=sys.stderr)

out = {
    "engine": "presidio", "dataset": dataset, "measured": time.strftime("%Y-%m-%d"),
    "host": f"presidio-analyzer 2.2.364 · spaCy {spacy.__version__} · en_core_web_lg · language=en"
            f" · {platform.system()} {platform.machine()}",
    "cases": len(cases), "probe": bool(limit), "offsets": "utf16",
    "ms": {"median": round(statistics.median(ms), 1),
           "p90": round(sorted(ms)[int(0.9 * len(ms))], 1), "total": round(sum(ms))},
    "preds": preds,
}
os.makedirs(os.path.join(HERE, "results"), exist_ok=True)
with open(os.path.join(HERE, "results", f"{dataset}.presidio.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False)
print(f"{dataset}: {len(cases)} cases · median {out['ms']['median']} ms", file=sys.stderr)
