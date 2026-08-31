#!/usr/bin/env bash
# Fetches the UPSTREAM dataset this comparison derives from — pinned to a reviewed
# commit and checksum-verified, so the derivation can be replayed byte-for-byte.
# The committed presidio-research.benchcase.json is the reference; this is the audit trail.
set -euo pipefail
cd "$(dirname "$0")/data"
SHA="78c45e587cedb5683cb299c9ae7c1c2d4840cdd9"   # data-privacy-stack/presidio-research @ main, 2026-08-31
SUM="ec08a771ba8135314cafb60752b2295212222ba3a4cd75d73811839c699e0012"
curl -fsSL -o synth_dataset_v2.json \
  "https://raw.githubusercontent.com/data-privacy-stack/presidio-research/${SHA}/data/synth_dataset_v2.json"
echo "${SUM}  synth_dataset_v2.json" | shasum -a 256 -c -
echo "ok: $(wc -c < synth_dataset_v2.json) bytes"
