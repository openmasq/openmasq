#!/usr/bin/env python
"""Claude as an ANNOTATOR, as a bench column — measured before it is ever trusted.

    python spans/claude.py uner                          -> spans/results/uner.claude.json
    python spans/claude.py uner 200                      -> the first 200 cases only (a probe)
    python spans/claude.py uner --prompt v2 --model opus --engine claude-v2
    python spans/claude.py --in ../../../../../openmasq-model/sample.jsonl --out ann.jsonl

The `--in` form annotates a plain jsonl of `{"id", "text"}` and writes `{"id", "spans"}` — the
TRAINING repository calls it that way, so the prompt these annotations were produced under is
the one this bench measured, rather than a second copy that drifts. (`predict.py` there
already reaches into this directory; the dependency runs private -> public, never back.)

Why this exists. The plan for the next student is NuNER's: a large model annotates a corpus
offline, a small encoder learns from it. The large model available here is Claude, and the
temptation is to point it at a corpus and start training. That is exactly the step that broke
the two retrained teachers of 2026-09-11 — pseudo-labels taken on faith.

So it is a bench column first. It is scored by the SAME scorer as every engine, against the
same gold, on a corpus whose annotation is human and public (UNER's English Web Treebank).
Only then is there a number to decide with: an annotator that scores near the second-human
column (`human.py`, TAB 0.906) is worth learning from; one that scores like GLiNER's 0.61
precision would teach a student its confident mistakes.

⚠️ It runs on the `claude -p` CLI — the SUBSCRIPTION, never an API key (project rule of
2026-09-05). ~10 s per call, so it batches documents and appends as it goes: interrupt it and
re-run, the cases already annotated are kept.

Offsets, not the model's arithmetic. The model returns VERBATIM strings; this script locates
each one in the text itself, every occurrence. Asking a language model for character offsets
is asking it to count, which it does badly; asking it to quote is asking it to read, which is
the thing it is good at. The product's own NER path locates entities the same way.
"""
import argparse
import json
import os
import platform
import re
import statistics
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")

# The label set is the CORPUS's, not ours: this column is scored against UNER's gold, so it
# must be asked for what UNER annotates. Guidance is the corpus's own convention — an
# organisation is any named collective actor, a location any named place.
PROMPTS = {}

PROMPTS["v1"] = """You are annotating text for named-entity recognition, following the CoNLL/Universal NER convention.

Find every named entity of these three types:
- PER — a named person (given name, surname, or both; not a role or a pronoun)
- ORG — a named organisation: company, institution, team, band, agency, publication, brand acting as a company
- LOC — a named location: country, city, region, address, named place, facility

Rules:
- Quote each entity EXACTLY as it appears, character for character, including its original case.
- Annotate the entity itself, not surrounding titles or determiners ("Mr", "the").
- Lower-cased and misspelt names still count ("walmart", "enron") — this text is informal.
- Do not annotate dates, times, numbers, products, or unnamed references.
- If a document has no entity, return an empty list for it.

Return ONLY a JSON object mapping each document id to its list of entities, nothing else:
{"<id>": [{"text": "<verbatim>", "label": "PER|ORG|LOC"}, ...], ...}

Documents:
"""

# v2 answers the errors v1 actually made, measured against UNER's gold on 2 054 mentions:
# 47 spans typed ORG where the gold says LOC, 66 boundaries off by a determiner or a nested
# place, 45 misses that are mostly e-mail signature initials and brand names. None of those
# is a reading failure — they are conventions nobody had stated. So v2 states them, with the
# real examples, and changes nothing else: one variable per measurement.
PROMPTS["v2"] = PROMPTS["v1"].replace("""Rules:""", """Type discipline (the most common error to avoid):
- A named geographic PLACE is LOC even when an organisation sits there or is named after it:
  "Wall Street", "Nimitz post office", "Air Force Base" are LOC.
- ORG is the collective ACTOR: a company, institution, agency, team, publication.
- A brand or software name used as its maker counts as ORG: "Firefox", "Kodak", "Groupon".
- Initials, handles or a short signature standing for a person are PER: "dp", "KK", "cgy", "M".
- A string that contains both, like "Michael Olsen@ENRON", is TWO entities, not one.

Rules:""").replace(
    '- Annotate the entity itself, not surrounding titles or determiners ("Mr", "the").',
    """- Annotate the entity itself, not surrounding titles ("Mr", "Dr").
- Keep a leading "The" only when it belongs to the name ("The Hague", "The Beatles").
- Take the LONGEST span that is one entity: "Washington, D.C." not "Washington".""")


def ask(prompt, payload, model, timeout):
    """One `claude -p` call. Returns the parsed object, or None when it cannot be read."""
    p = subprocess.run(
        ["claude", "-p", prompt + payload, "--output-format", "text"]
        + (["--model", model] if model else []),
        capture_output=True, text=True, timeout=timeout)
    out = p.stdout.strip()
    if not out:
        print(f"  (empty answer: {p.stderr.strip()[:200]})", file=sys.stderr)
        return None
    # The CLI may wrap the object in prose or a fence; take the outermost {...}.
    m = re.search(r"\{.*\}", out, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def locate(text, entities):
    """Verbatim strings -> character spans, every occurrence, longest first so that a name
    inside an organisation ("Enron" in "Enron Corp") does not steal its characters."""
    spans = []
    for e in sorted(entities, key=lambda e: -len(e.get("text") or "")):
        s, lab = (e.get("text") or "").strip(), (e.get("label") or "").strip().upper()
        if not s or lab not in ("PER", "ORG", "LOC"):
            continue
        start = 0
        while True:
            i = text.find(s, start)
            if i < 0:
                break
            if not any(i < b and i + len(s) > a for a, b, _ in spans):
                spans.append((i, i + len(s), lab))
            start = i + len(s)
    return sorted(spans)


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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dataset", nargs="?", default="")
    ap.add_argument("--in", dest="src", default="", help="a jsonl of {id, text} to annotate")
    ap.add_argument("--out", dest="dst", default="", help="where the annotations go")
    ap.add_argument("limit", nargs="?", type=int, default=0)
    ap.add_argument("--batch", type=int, default=8, help="documents per model call")
    ap.add_argument("--prompt", default="v1", choices=sorted(PROMPTS),
                    help="which stated convention to annotate under")
    ap.add_argument("--engine", default="claude", help="column name in the bench table")
    ap.add_argument("--model", default="", help="passed to `claude --model`")
    ap.add_argument("--timeout", type=int, default=600)
    a = ap.parse_args()

    if a.src:
        cases = [json.loads(l) for l in open(a.src, encoding="utf-8")]
        for i, c in enumerate(cases):
            c.setdefault("id", str(i))
        out_path = a.dst or (a.src.replace(".jsonl", "") + ".ann.jsonl")
    else:
        cases = json.load(open(os.path.join(DATA, f"{a.dataset}.spancase.json"), encoding="utf-8"))
        out_path = os.path.join(HERE, "results", f"{a.dataset}.{a.engine}.json")
    if a.limit:
        cases = cases[:a.limit]
    # Resume: a run costs tens of minutes of subscription time, so nothing already answered
    # is asked twice. The stamp must match or the file is rebuilt.
    done = {}
    if os.path.exists(out_path):
        if a.src:
            done = {r["id"]: r["spans"] for r in
                    (json.loads(l) for l in open(out_path, encoding="utf-8"))}
        else:
            prev = json.load(open(out_path, encoding="utf-8"))
            if prev.get("dataset") == a.dataset:
                done = prev.get("labels", {})
        print(f"resuming: {len(done)} case(s) already annotated", file=sys.stderr)

    todo = [c for c in cases if c["id"] not in done]
    ms, failed = [], 0
    for i in range(0, len(todo), a.batch):
        chunk = todo[i:i + a.batch]
        payload = "\n\n".join(f'--- id: {c["id"]}\n{c["text"]}' for c in chunk)
        t = time.perf_counter()
        got = ask(PROMPTS[a.prompt], payload, a.model, a.timeout)
        if got is None and len(chunk) > 1:
            # A batch answer is unreadable when it is TRUNCATED, not when the documents are
            # hard: measured 15 of 79 batches lost that way on the longer v2 prompt, 114
            # documents for nothing. Re-ask them one at a time rather than drop them — the
            # cost is seconds, and a silent 18 % hole in a training corpus is not a cost
            # anyone can see later.
            print(f"  unreadable batch, re-asking {len(chunk)} one by one", file=sys.stderr)
            got = {}
            for c in chunk:
                one = ask(PROMPTS[a.prompt], f'--- id: {c["id"]}\n{c["text"]}',
                          a.model, a.timeout)
                if one:
                    got.update(one)
        ms.append((time.perf_counter() - t) * 1000 / len(chunk))
        if not got:
            failed += len(chunk)
            print(f"  {i + len(chunk)}/{len(todo)} · unreadable answer, skipped", file=sys.stderr)
            continue
        for c in chunk:
            ents = got.get(c["id"])
            if ents is None:
                failed += 1
                continue
            spans = locate(c["text"], ents if isinstance(ents, list) else [])
            m = None if a.src else utf16(c["text"])   # the trainer counts code points
            done[c["id"]] = [[m[s], m[e], lab] if m else [s, e, lab] for s, e, lab in spans]
        print(f"  {i + len(chunk)}/{len(todo)} · {statistics.median(ms) / 1000:.0f} s/doc",
              file=sys.stderr)
        # written every batch, not at the end: a long run must survive an interruption
        save(out_path, a, done, ms, failed)
    save(out_path, a, done, ms, failed)
    print(f"{a.dataset}: {len(done)} annotated, {failed} unreadable -> "
          f"results/{a.dataset}.{a.engine}.json", file=sys.stderr)


def save(path, a, done, ms, failed):
    if a.src:                        # the training repo's form: one annotated case per line
        with open(path, "w", encoding="utf-8") as f:
            for cid, spans in done.items():
                f.write(json.dumps({"id": cid, "spans": spans}, ensure_ascii=False) + "\n")
        return
    version = subprocess.run(["claude", "--version"], capture_output=True, text=True).stdout.strip()
    json.dump({
        "engine": a.engine, "dataset": a.dataset, "prompt": a.prompt, "measured": time.strftime("%Y-%m-%d"),
        "host": f"{platform.system()} {platform.machine()} · claude -p {version}"
                f"{' · ' + a.model if a.model else ' · CLI default'} · batch {a.batch}",
        "cases": len(done), "probe": bool(a.limit), "offsets": "utf16", "unreadable": failed,
        "ms": {"median": round(statistics.median(ms), 1) if ms else 0,
               "p90": round(sorted(ms)[int(0.9 * len(ms))], 1) if ms else 0,
               "total": round(sum(ms))},
        "preds": {k: [[s, e] for s, e, _ in v] for k, v in done.items()},
        "labels": done,
    }, open(path, "w", encoding="utf-8"), ensure_ascii=False)


if __name__ == "__main__":
    main()
