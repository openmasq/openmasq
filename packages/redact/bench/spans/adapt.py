#!/usr/bin/env python
"""Derives the span-level cases (`data/<dataset>.spancase.json`) from the pinned upstream files.

    python adapt.py                 # all four datasets, default sample sizes
    python adapt.py nemotron 20000  # one dataset, another sample size (0 = the whole split)

Every case is `{ id, lang, text, spans: [{ start, end, label, entity, scope }] }` with
character offsets straight from the upstream annotation — nothing re-annotated, nothing
re-aligned. `scope` is OUR reading of each upstream label, and it is the whole honesty of
the comparison, so it is spelled out per dataset below:

  in   — an identity datum the product claims to redact (name, contact, address, identifier,
         credential, health). Scored for recall in BOTH views.
  out  — a real annotation the product does not claim (plain dates and times, country,
         occupation, demographics, opinions…). Scored for recall in the ALL-LABELS view only —
         the view comparable to the numbers Perplexity publishes — never charged as a
         false positive in either.
  ctx  — annotated upstream as NOT requiring masking (TAB `NO_MASK`). Never in recall,
         never a false positive.

`entity` groups the mentions of one identifier (TAB carries an entity id; the others get
label + lowercased surface form), which is what the consistency score counts.

Sampling is a fixed-seed `random.Random(SEED).sample` over the split in file order; the
sampled ids, the seed, the upstream revisions and the file checksums go to `manifest.json`
so the exact same cases can be rebuilt on another machine.
"""
import ast
import glob
import hashlib
import json
import os
import random
import sys

import pyarrow.parquet as pq

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
SEED = 20260907
DEFAULT_N = {"ai4privacy": 6000, "nemotron": 6000, "gretel": 0, "tab": 0}  # 0 = whole split
# The MODEL columns are measured on the first `MODEL_N` of that seeded sample — an hour of
# laptop each. `run.mts --limit` and `pplx.py <dataset> <n>` take the same number, and a table
# only ever compares columns on the cases they ALL cover.
MODEL_N = {"ai4privacy": 2000, "nemotron": 2000, "gretel": 2000, "tab": 0}

REVISIONS = {
    "ai4privacy": "ai4privacy/pii-masking-300k@c8c77895a005822682b66ab547fc0422579bc1d3 (validation, 47 728 rows — the split the PII-TRACE paper reports on)",
    "nemotron": "nvidia/Nemotron-PII@b70ffaf5ff39e079776134c5bf4381f00a9fd1ed (test)",
    "gretel": "gretelai/synthetic_pii_finance_multilingual@7b844d16738527a04264f50214cb426a4cea0897 (test)",
    "tab": "mattmdjaga/text-anonymization-benchmark-val-test@cb31e803321d83ef623f27e5f35434b844725120 (test)",
}

# ---- scope per upstream label ---------------------------------------------------------
# ai4privacy (300k): 28 labels. Out of the product's claim: plain dates and times, sex,
# civility title, country (kept in clear outside Strict, by product decision), geographic
# coordinates, and the card ISSUER's name (a brand, not an identity).
AI4_OUT = {"DATE", "TIME", "SEX", "TITLE", "COUNTRY", "GEOCOORD", "CARDISSUER"}
# Nemotron-PII: 55 labels. Out of the product's claim: bare dates/times, country, occupation,
# demographics and opinions (the product redacts health data, not race, religion, politics or
# sexuality), and geographic coordinates.
NEMO_OUT = {
    "date", "time", "date_time", "country", "occupation", "employment_status", "education_level",
    "race_ethnicity", "language", "gender", "age", "political_view", "religious_belief",
    "sexuality", "coordinate",
}
# Gretel: bare dates and times are out; everything else is an identifier or a credential.
GRETEL_OUT = {"date", "time", "date_time"}
# TAB: entity types. DATETIME, QUANTITY, DEM (demographic), MISC are out; PERSON, ORG, LOC,
# CODE are in. `identifier_type` NO_MASK → ctx.
TAB_OUT = {"DATETIME", "QUANTITY", "DEM", "MISC"}

def utf16(text):
    """Code-point offset -> UTF-16 offset map, or None when they coincide (no astral character).
    The scorer is JavaScript, whose string indices count UTF-16 units; every upstream offset
    counts code points. Converted ONCE, here, so the offsets in the case files are the ones the
    scorer slices with."""
    if all(ord(ch) < 0x10000 for ch in text):
        return None
    m, pos = [0] * (len(text) + 1), 0
    for i, ch in enumerate(text):
        m[i] = pos
        pos += 2 if ord(ch) >= 0x10000 else 1
    m[len(text)] = pos
    return m

def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()

def key(label, text):
    return f"{label}:{' '.join(text.lower().split())}"

def sample(items, n):
    """`(upstream row index, record)` pairs — the INDEX comes back with the row because an
    upstream id is not always unique. Nemotron-PII repeats `uid`: 6 000 sampled rows carried
    5 804 distinct ones, so a prediction keyed on the id was scored against another document's
    text. `main()` now refuses a derivation whose ids collide."""
    if not n or n >= len(items):
        return list(enumerate(items))
    return [(i, items[i]) for i in sorted(random.Random(SEED).sample(range(len(items)), n))]

def ai4privacy(n):
    rows = []
    for f in sorted(glob.glob(os.path.join(DATA, "ai4privacy-val-*.jsonl"))):
        with open(f, encoding="utf-8") as fh:
            rows += [json.loads(line) for line in fh]
    out = []
    for i, r in sample(rows, n):
        # GIVENNAME1/2, LASTNAME1/2/3 are the same person's name parts: the numeral is dropped
        # so every mention of one name groups under one entity, which is what consistency counts.
        spans = [{"start": m["start"], "end": m["end"], "label": m["label"],
                  "entity": key(m["label"].rstrip("123"), m["value"]),
                  "scope": "out" if m["label"] in AI4_OUT else "in"}
                 for m in (r.get("privacy_mask") or [])]
        out.append({"id": f"ai4-{i}-{r['id']}", "lang": r["language"], "text": r["source_text"], "spans": spans})
    return out

def nemotron(n):
    t = pq.read_table(os.path.join(DATA, "nemotron-test.parquet"), columns=["uid", "text", "spans", "locale", "document_format"]).to_pylist()
    out = []
    for i, r in sample(t, n):
        spans = []
        for s in ast.literal_eval(r["spans"]):
            spans.append({"start": s["start"], "end": s["end"], "label": s["label"],
                          "entity": key(s["label"], r["text"][s["start"]:s["end"]]),
                          "scope": "out" if s["label"] in NEMO_OUT else "in"})
        # ⚠️ the row index, not `uid` alone: `uid` repeats in this split (see `sample`).
        out.append({"id": f"nem-{i}", "lang": "en", "text": r["text"], "spans": spans,
                    "meta": {"uid": r["uid"], "locale": r["locale"], "format": r["document_format"]}})
    return out

GRETEL_LANG = {"English": "en", "German": "de", "Dutch": "nl", "Spanish": "es", "Italian": "it", "Swedish": "sv", "France": "fr", "French": "fr"}

def gretel(n):
    t = pq.read_table(os.path.join(DATA, "gretel-test.parquet"), columns=["index", "generated_text", "pii_spans", "language", "document_type"]).to_pylist()
    out = []
    for _i, r in sample(t, n):
        text = r["generated_text"]
        spans = [{"start": s["start"], "end": s["end"], "label": s["label"],
                  "entity": key(s["label"], text[s["start"]:s["end"]]),
                  "scope": "out" if s["label"] in GRETEL_OUT else "in"} for s in json.loads(r["pii_spans"])]
        out.append({"id": f"gretel-{r['index']}", "lang": GRETEL_LANG.get(r["language"], r["language"]), "text": text, "spans": spans,
                    "meta": {"document_type": r["document_type"]}})
    return out

def tab(n):
    t = pq.read_table(os.path.join(DATA, "tab-test.parquet")).to_pylist()
    out = []
    for _i, r in sample(t, n):
        ann = r["annotations"]
        # ONE annotator per document: the quality-checked one when the corpus names it, else
        # the first with mentions. TAB has up to ten annotators per text and no gold union;
        # this is the reading the TAB paper itself evaluates against.
        names = [a for a in (r["quality_checked"] or []) if ann.get(a) and ann[a].get("entity_mentions")]
        if not names:
            names = [a for a, v in ann.items() if v and v.get("entity_mentions")]
        a = ann[names[0]]
        spans = []
        for m in a["entity_mentions"]:
            scope = "ctx" if m["identifier_type"] == "NO_MASK" else ("out" if m["entity_type"] in TAB_OUT else "in")
            spans.append({"start": m["start_offset"], "end": m["end_offset"], "label": m["entity_type"],
                          "entity": m["entity_id"], "scope": scope, "identifier": m["identifier_type"]})
        out.append({"id": r["doc_id"], "lang": "en", "text": r["text"], "spans": spans, "meta": {"annotator": names[0]}})
    return out

BUILD = {"ai4privacy": ai4privacy, "nemotron": nemotron, "gretel": gretel, "tab": tab}

def main():
    which = sys.argv[1:2] or list(BUILD)
    n_override = int(sys.argv[2]) if len(sys.argv) > 2 else None
    mpath = os.path.join(HERE, "manifest.json")
    manifest = json.load(open(mpath)) if os.path.exists(mpath) else {}
    for name in which:
        n = n_override if n_override is not None else DEFAULT_N[name]
        cases = BUILD[name](n)
        ids = [c["id"] for c in cases]
        if len(set(ids)) != len(ids):
            raise SystemExit(f"{name}: {len(ids) - len(set(ids))} duplicate case ids — a prediction "
                             "keyed on an id would be scored against another document's text")
        # An upstream span whose offsets do not slice the text (Gretel has 27 such in its
        # test split) is DROPPED and counted in the manifest — it can be neither found nor missed.
        bad = 0
        for c in cases:
            ok = [s for s in c["spans"] if 0 <= s["start"] < s["end"] <= len(c["text"])]
            bad += len(c["spans"]) - len(ok)
            m = utf16(c["text"])
            if m:
                for s in ok:
                    s["start"], s["end"] = m[s["start"]], m[s["end"]]
            c["spans"] = ok
        files = sorted(glob.glob(os.path.join(DATA, {"ai4privacy": "ai4privacy-val-*.jsonl", "nemotron": "nemotron-test.parquet", "gretel": "gretel-test.parquet", "tab": "tab-test.parquet"}[name])))
        with open(os.path.join(DATA, f"{name}.spancase.json"), "w", encoding="utf-8") as f:
            json.dump(cases, f, ensure_ascii=False)
        manifest[name] = {
            "upstream": REVISIONS[name], "files": {os.path.basename(p): sha(p) for p in files},
            "seed": SEED, "sample": n or "whole split", "cases": len(cases),
            "spans": sum(len(c["spans"]) for c in cases), "dropped_bad_offsets": bad,
            "scope": {s: sum(1 for c in cases for x in c["spans"] if x["scope"] == s) for s in ("in", "out", "ctx")},
            "ids": [c["id"] for c in cases],
        }
        print(f"{name}: {len(cases)} cases, {manifest[name]['spans']} spans {manifest[name]['scope']}, {bad} bad offsets")
    with open(mpath, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=0)

if __name__ == "__main__":
    main()
