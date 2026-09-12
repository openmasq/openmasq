#!/usr/bin/env python
"""A SECOND human annotator as a bench column — the ceiling every engine is measured against.

    python spans/human.py            -> spans/results/tab.human.json

TAB is annotated by up to ten people per document and publishes no gold union; `adapt.py`
scores against ONE of them (the quality-checked annotator, the reading the TAB paper itself
evaluates against). So a column that asks "how well does a DIFFERENT annotator score against
that same gold?" answers the only question that makes a target number meaningful: what does
agreement look like when both sides are human and neither is guessing.

Read it as the scale of the task, not as an engine to beat. An engine ABOVE this line is not
superhuman — it has learnt one annotator's habits, which is what a single-reference benchmark
rewards. An engine below it still has room that is not an annotation artefact.

It is scored by the SAME scorer as every other column (`run.mts` replays this file like any
engine's): the point of writing a result file rather than computing an F1 here is that a
second implementation of the metric is how two numbers for one measurement start to exist.

Only TAB carries several annotators. The other corpora are synthetic — their "annotation" is
the generator's own record of what it inserted, so a second opinion does not exist and the
ceiling question does not arise the same way.
"""
import json
import os
import platform
import sys
import time

import pyarrow.parquet as pq

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")


def utf16(text):
    """Code-point -> UTF-16 offsets (the scorer is JavaScript); None when they coincide.
    The same conversion `adapt.py` applies to the gold, so both sides of the comparison
    count positions the same way."""
    if all(ord(ch) < 0x10000 for ch in text):
        return None
    m, pos = [0] * (len(text) + 1), 0
    for i, ch in enumerate(text):
        m[i] = pos
        pos += 2 if ord(ch) >= 0x10000 else 1
    m[len(text)] = pos
    return m


def main():
    cases = {c["id"]: c for c in json.load(
        open(os.path.join(DATA, "tab.spancase.json"), encoding="utf-8"))}
    rows = pq.read_table(os.path.join(DATA, "tab-test.parquet")).to_pylist()
    preds, labels, used, alone = {}, {}, 0, 0
    for r in rows:
        case = cases.get(r["doc_id"])
        if case is None:                      # not in the derived sample
            continue
        gold_annotator = case["meta"]["annotator"]
        ann = r["annotations"]
        others = [a for a, v in ann.items()
                  if a != gold_annotator and v and v.get("entity_mentions")]
        if not others:
            alone += 1                        # singly annotated: no second opinion to offer
            continue
        # The FIRST other annotator, deterministically — not the closest one. Picking the
        # best-agreeing of several would measure our choice rather than their agreement.
        a = ann[sorted(others)[0]]
        spans = []
        for m in a["entity_mentions"]:
            # NO_MASK is the corpus's own "this mention identifies nobody"; `adapt.py` marks
            # those `ctx` in the gold and the scorer neither credits nor charges them, so a
            # human column must not claim them either.
            if m["identifier_type"] == "NO_MASK":
                continue
            spans.append([m["start_offset"], m["end_offset"], m["entity_type"]])
        mp = utf16(case["text"])
        if mp:
            spans = [[mp[s], mp[e], lab] for s, e, lab in spans]
        spans.sort()
        preds[r["doc_id"]] = [[s, e] for s, e, _ in spans]
        labels[r["doc_id"]] = spans
        used += 1

    res = {
        "engine": "human", "dataset": "tab", "measured": time.strftime("%Y-%m-%d"),
        "host": f"{platform.system()} {platform.machine()} · a second TAB annotator, "
                f"first by name among those who annotated the same document",
        "cases": used, "offsets": "utf16",
        "ms": {"median": 0, "p90": 0, "total": 0},
        "preds": preds, "labels": labels,
    }
    with open(os.path.join(HERE, "results", "tab.human.json"), "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False)
    print(f"tab: {used} documents with a second annotator, {alone} with only one "
          f"-> results/tab.human.json", file=sys.stderr)


if __name__ == "__main__":
    main()
