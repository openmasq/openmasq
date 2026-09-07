#!/usr/bin/env python
"""Presidio's spans on a span-level dataset — a column `run.mts` replays without Python.

    python spans/presidio.py tab            -> spans/results/tab.presidio.json
    python spans/presidio.py nemotron 2000  -> the first 2000 cases only

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
dataset = sys.argv[1]
limit = int(sys.argv[2]) if len(sys.argv) > 2 else 0
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
