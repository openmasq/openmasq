#!/usr/bin/env python
"""Presidio's detections on a corpus — the yardstick `compare.mts` replays without Python.

    python bench/presidio.py external   -> bench/external/presidio.detections.json
    python bench/presidio.py internal   -> bench/presidio.detections.json

DEFAULT configuration of the AnalyzerEngine on purpose (predefined recognizers, score
threshold 0, `language="en"`): it is what a default install detects, on the text a user
actually has — the internal corpus is 14 languages, and Presidio's default install is
English. That is the comparison the README reports, and the README says so; it is not
Presidio's ceiling, which is a library built to receive recognizers and models.

NRP detections are dropped: NRP is out of scope on both sides (the adapter annotates it
`CONTEXT`), and the metric would not count them as errors anyway.

Environment (pinned, the versions the committed detections were produced with):
    python3.12 -m venv v && v/bin/pip install presidio-analyzer==2.2.364 spacy==3.8.16
    v/bin/python -m spacy download en_core_web_lg
"""
import glob
import json
import os
import sys
import time

from presidio_analyzer import AnalyzerEngine

HERE = os.path.dirname(os.path.abspath(__file__))
which = sys.argv[1] if len(sys.argv) > 1 else "external"

if which == "external":
    cases = json.load(open(os.path.join(HERE, "external", "presidio-research.benchcase.json")))
    out_path = os.path.join(HERE, "external", "presidio.detections.json")
elif which == "internal":
    cases = []
    for f in sorted(glob.glob(os.path.join(HERE, "corpora", "*.json"))):
        # `tokensVsFakes.json` is a different kind of bench and carries no `truth`.
        cases += [c for c in json.load(open(f)) if isinstance(c.get("truth"), list)]
    out_path = os.path.join(HERE, "presidio.detections.json")
else:
    sys.exit("usage: presidio.py external|internal")

engine = AnalyzerEngine(default_score_threshold=0)
out, t0 = {}, time.time()
for i, c in enumerate(cases):
    results = engine.analyze(text=c["text"], language="en")
    out[c["id"]] = [c["text"][r.start:r.end] for r in results if r.entity_type != "NRP"]
    if i % 200 == 0:
        print(f"  {i}/{len(cases)} ({time.time() - t0:.0f}s)", file=sys.stderr)
json.dump(out, open(out_path, "w"), ensure_ascii=False, indent=1)
print(f"{len(cases)} cases analysed in {time.time() - t0:.0f}s -> {os.path.relpath(out_path, HERE)}")
