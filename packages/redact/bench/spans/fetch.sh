#!/usr/bin/env bash
# Fetches the four PUBLIC PII benchmarks this comparison scores on — the same ones
# Perplexity's PII-TRACE paper reports against (ai4privacy, Nemotron-PII, Gretel PII,
# TAB/ECHR; SPY is not published on the Hub) — pinned to a dataset revision and
# checksum-verified, so `adapt.py` replays byte-for-byte.
set -euo pipefail
cd "$(dirname "$0")/data"
HF=https://huggingface.co/datasets

fetch() { # <dataset> <revision> <path in repo> <local name> <sha256>
  curl -fsSL -o "$4" "$HF/$1/resolve/$2/$3"
  echo "$5  $4" | shasum -a 256 -c - >/dev/null && echo "ok  $4 ($(wc -c < "$4") bytes)"
}

# ai4privacy/pii-masking-300k @ 2026-06-03 — validation split, six languages, 47 728 rows.
# ⚠️ THIS release, not the larger `pii-masking-400k`: the PII-TRACE paper reports on an
# ai4privacy validation split of 47 728 documents, which is exactly this one. 400k's
# validation split has 81 379 rows, a sparser annotation (1.1 spans per row against 7) and
# no DATE/TIME/SEX/TITLE labels — scoring on it measured a different dataset.
A=ai4privacy/pii-masking-300k; AR=c8c77895a005822682b66ab547fc0422579bc1d3
fetch $A $AR data/validation/1english_openpii_8k.jsonl ai4privacy-val-en.jsonl 3112f54972d1a117936b75fa455e41872df36d4a8e7500ac9663e3ee671729e1
fetch $A $AR data/validation/dutch_openpii_7k.jsonl    ai4privacy-val-nl.jsonl 03af27d35ea80384d6a659c9502fadd43527f2e10eb7791e9e43c972013127db
fetch $A $AR data/validation/french_openpii_8k.jsonl   ai4privacy-val-fr.jsonl 912922c99bbfcc498cbdc2a9ce4d2df08d63b9e29a40d4c9ddb1249e18c8e72d
fetch $A $AR data/validation/german_openpii_8k.jsonl   ai4privacy-val-de.jsonl b2d559ff95c19c78cdfc4839483e92491a31b2fa5cd816524872799481427484
fetch $A $AR data/validation/italian_openpiii_8k.jsonl ai4privacy-val-it.jsonl db812240395be89ff540de842495ad9393222acf1f297a1f95af555a46184432
fetch $A $AR data/validation/spanish_openpii_8k.jsonl  ai4privacy-val-es.jsonl fa5552aa48022ee033799c19a7b54aa25a3fb0b7265f7dc1833ff0beef929b77
# nvidia/Nemotron-PII @ 2025-12-17 — test split, 100 000 English records, 55 labels
fetch nvidia/Nemotron-PII b70ffaf5ff39e079776134c5bf4381f00a9fd1ed data/test-00000-of-00001.parquet nemotron-test.parquet 1a4b0512ecb5370f0992d29d0f9c07351e6de13f0d7ea33bb18cecb984780247
# gretelai/synthetic_pii_finance_multilingual @ 2024-06-11 — test split, 5 594 documents, 7 languages
fetch gretelai/synthetic_pii_finance_multilingual 7b844d16738527a04264f50214cb426a4cea0897 data/test-00000-of-00001.parquet gretel-test.parquet 014e1057978f030fce4f4cad7c93b9e3377fd0ded713d2bf4c7de00e3e3c8c72
# Text Anonymization Benchmark (Pilán et al. 2022, ECHR court cases) — test split, 127 documents,
# Hub mirror mattmdjaga/text-anonymization-benchmark-val-test @ 2024-03-20
fetch mattmdjaga/text-anonymization-benchmark-val-test cb31e803321d83ef623f27e5f35434b844725120 data/test-00000-of-00001.parquet tab-test.parquet 62eacd89cbfdf58a08566866c726455167bfb84ba7fae1ab3909b9605cddcef4
