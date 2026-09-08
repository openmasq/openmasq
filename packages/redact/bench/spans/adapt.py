#!/usr/bin/env python
"""Derives the span-level cases (`data/<dataset>.spancase.json`) from the pinned upstream files.

    python adapt.py                 # all four datasets, default sample sizes
    python adapt.py nemotron 20000  # one dataset, another sample size (0 = the whole split)

Every case is `{ id, lang, text, spans: [{ start, end, label, cat, entity }] }` with
character offsets straight from the upstream annotation — nothing re-annotated, nothing
re-aligned. `cat` is OUR reading of each upstream label — the APP category it belongs to, or
`None` when the product has none — and it is the whole honesty of the comparison, so it is
spelled out label by label below. `metric.ts` turns it into the two views: the app's
categories (what compares two engines) and every upstream label (what compares to a published
figure). A span the corpus itself marks as identifying nobody (TAB `NO_MASK`) carries
`scope: "ctx"` and is never scored, in either view, nor charged as a false positive.

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

# ---- what the PRODUCT calls each upstream label ----------------------------------------
# The comparison that carries meaning is per APP CATEGORY, not per corpus label. Each corpus
# annotates its own vocabulary — Gretel has `company`, Nemotron has `occupation`, TAB has
# `MISC` — so one F1 pooled over "every label this corpus happens to carry" compares four
# different definitions of what personal data is, and ranks engines on that difference.
#
# So every upstream label is mapped to the category the APP exposes (`@openmasq/catalog`
# `REDACTION_CATEGORIES`, plus the engine's retired `health`, which the corpora annotate and
# the product no longer switches on). `None` = the product has NO category for it: no switch,
# no rule, nothing to claim. Which categories are IN the product's scope is NOT decided here —
# `metric.ts` reads it from the catalog itself, so the claim has one home (rule 9) and a
# category retired or added there moves this bench without a re-derivation.
#
# A mapping is a product statement, so it errs towards `None`: claiming a label the app does
# not actually cover would flatter our own columns first. Every label of every corpus must
# appear — `cat()` raises on an unknown one rather than letting it default to "not ours".

AI4_CAT = {
    "GIVENNAME1": "name", "GIVENNAME2": "name", "LASTNAME1": "name", "LASTNAME2": "name",
    "LASTNAME3": "name", "BOD": "dob", "DATE": "date", "EMAIL": "email", "TEL": "phone",
    "IP": "ip", "USERNAME": "username", "PASS": "secret",
    "IDCARD": "national_id", "PASSPORT": "national_id", "DRIVERLICENSE": "national_id",
    "SOCIALNUMBER": "national_id",
    "STREET": "address", "BUILDING": "address", "SECADDRESS": "address",
    "CITY": "location", "STATE": "location", "POSTCODE": "location",
    # No category in the app: a time of day, a civility, a sex, a country (a product decision:
    # it stays readable), a lat/long pair, and the card ISSUER (a brand, not an identity).
    "TIME": None, "TITLE": None, "SEX": None, "COUNTRY": None, "GEOCOORD": None,
    "CARDISSUER": None,
}

GRETEL_CAT = {
    "name": "name", "first_name": "name", "last_name": "name",
    "company": "company", "street_address": "address", "email": "email",
    "phone_number": "phone", "date": "date", "date_time": "date", "date_of_birth": "dob",
    # « IBAN / coordonnees bancaires » is the app's one switch for an account identifier.
    "iban": "iban", "bban": "iban", "swift_bic_code": "iban", "bank_routing_number": "iban",
    "credit_card_number": "card", "credit_card_security_code": "card",
    "ssn": "national_id", "driver_license_number": "national_id",
    "passport_number": "national_id",
    "customer_id": "company_id", "employee_id": "company_id",
    "password": "secret", "account_pin": "secret", "api_key": "secret",
    "ipv4": "ip", "ipv6": "ip", "user_name": "username",
    "time": None, "local_latlng": None,
}

NEMO_CAT = {
    "first_name": "name", "last_name": "name", "company_name": "company", "email": "email",
    "url": "url", "phone_number": "phone", "fax_number": "phone",
    "date": "date", "date_time": "date", "date_of_birth": "dob",
    "street_address": "address",
    "city": "location", "state": "location", "county": "location", "postcode": "location",
    "customer_id": "company_id", "employee_id": "company_id", "unique_id": "company_id",
    "account_number": "iban", "bank_routing_number": "iban", "swift_bic": "iban",
    "credit_debit_card": "card", "cvv": "card",
    "ssn": "national_id", "national_id": "national_id", "tax_id": "national_id",
    "certificate_license_number": "national_id",
    "user_name": "username", "password": "secret", "pin": "secret", "api_key": "secret",
    "http_cookie": "secret", "ipv4": "ip", "ipv6": "ip",
    # Health data: annotated here, and the app's `health` category is RETIRED (forced off at
    # the send merge). Mapped anyway, so the table SHOWS the gap instead of hiding it.
    "medical_record_number": "health", "health_plan_beneficiary_number": "health",
    "blood_type": "health",
    # No category in the app: a time, a country, a coordinate, the identifiers of a THING
    # (vehicle, device, MAC, biometric print), and the demographics the product does not
    # redact (it protects health data, not race, religion, politics or sexuality).
    "time": None, "country": None, "coordinate": None, "license_plate": None,
    "vehicle_identifier": None, "device_identifier": None, "biometric_identifier": None,
    "mac_address": None, "occupation": None, "employment_status": None,
    "education_level": None, "race_ethnicity": None, "language": None, "gender": None,
    "age": None, "political_view": None, "religious_belief": None, "sexuality": None,
}

# TAB annotates entity TYPES, not data kinds. `CODE` is a case/application number — the app's
# nearest switch is the identifier one, and the fit is the loosest of the four corpora.
TAB_CAT = {"PERSON": "name", "ORG": "company", "LOC": "location", "CODE": "national_id",
           "DATETIME": "date", "QUANTITY": None, "DEM": None, "MISC": None}

def count_by(f, cases):
    """Spans per key, sorted — the manifest's own census of what a corpus annotates."""
    n = {}
    for c in cases:
        for x in c["spans"]:
            k = f(x)
            n[k] = n.get(k, 0) + 1
    return dict(sorted(n.items(), key=lambda kv: (-kv[1], kv[0])))

def cat(mapping, label, dataset):
    """The app category for an upstream label. Raises on an unknown one: a corpus that adds a
    label must be READ, not silently filed under "the product doesn't claim it" — that
    direction of default is the one that flatters our columns."""
    if label not in mapping:
        raise SystemExit(f"{dataset}: upstream label {label!r} has no app category in adapt.py — "
                         "map it (or map it to None, deliberately) before deriving")
    return mapping[label]

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
                  "cat": cat(AI4_CAT, m["label"], "ai4privacy")}
                 for m in (r.get("privacy_mask") or [])]
        out.append({"id": f"ai4-{i}-{r['id']}", "lang": LANG.get(r["language"], r["language"]),
                    "text": r["source_text"], "spans": spans})
    return out

def nemotron(n):
    t = pq.read_table(os.path.join(DATA, "nemotron-test.parquet"), columns=["uid", "text", "spans", "locale", "document_format"]).to_pylist()
    out = []
    for i, r in sample(t, n):
        spans = []
        for s in ast.literal_eval(r["spans"]):
            spans.append({"start": s["start"], "end": s["end"], "label": s["label"],
                          "entity": key(s["label"], r["text"][s["start"]:s["end"]]),
                          "cat": cat(NEMO_CAT, s["label"], "nemotron")})
        # ⚠️ the row index, not `uid` alone: `uid` repeats in this split (see `sample`).
        out.append({"id": f"nem-{i}", "lang": "en", "text": r["text"], "spans": spans,
                    "meta": {"uid": r["uid"], "locale": r["locale"], "format": r["document_format"]}})
    return out

# Upstream writes a language as it pleases — "English", "France", "en". One vocabulary here,
# ISO 639-1, so a per-language table reads the same whichever corpus produced the row.
LANG = {"English": "en", "German": "de", "Dutch": "nl", "Spanish": "es", "Italian": "it",
        "Swedish": "sv", "France": "fr", "French": "fr", "Portuguese": "pt", "Polish": "pl"}

def gretel(n):
    t = pq.read_table(os.path.join(DATA, "gretel-test.parquet"), columns=["index", "generated_text", "pii_spans", "language", "document_type"]).to_pylist()
    out = []
    for _i, r in sample(t, n):
        text = r["generated_text"]
        spans = [{"start": s["start"], "end": s["end"], "label": s["label"],
                  "entity": key(s["label"], text[s["start"]:s["end"]]),
                  "cat": cat(GRETEL_CAT, s["label"], "gretel")} for s in json.loads(r["pii_spans"])]
        out.append({"id": f"gretel-{r['index']}", "lang": LANG.get(r["language"], r["language"]), "text": text, "spans": spans,
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
            # NO_MASK is the corpus's own "this mention identifies nobody": ctx, never scored,
            # and never charged against precision either.
            spans.append({"start": m["start_offset"], "end": m["end_offset"], "label": m["entity_type"],
                          "entity": m["entity_id"], "cat": cat(TAB_CAT, m["entity_type"], "tab"),
                          **({"scope": "ctx"} if m["identifier_type"] == "NO_MASK" else {}),
                          "identifier": m["identifier_type"]})
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
            # Spans per APP CATEGORY — the manifest says, per corpus, what the product is
            # being scored on. `null` is what no category of the app covers, `ctx` what the
            # corpus itself marks as identifying nobody.
            "categories": count_by(lambda x: "ctx" if x.get("scope") == "ctx" else (x["cat"] or "none"), cases),
            "ids": [c["id"] for c in cases],
        }
        print(f"{name}: {len(cases)} cases, {manifest[name]['spans']} spans, {bad} bad offsets")
    with open(mpath, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=0)

if __name__ == "__main__":
    main()
