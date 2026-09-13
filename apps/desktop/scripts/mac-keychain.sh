#!/usr/bin/env bash
# Build the macOS signing keychain OURSELVES, and hand electron-builder the finished thing.
#
# ⛔ WHY THIS EXISTS — electron-builder 26.15.3 cannot do it. `createKeychain`
# (app-builder-lib/out/codeSign/macCodeSign.js) creates the temp keychain with a RANDOM
# password:
#
#     const keychainPassword = randomBytes(32).toString("base64")   // line 137
#     ["create-keychain", "-p", keychainPassword, keychainFile]
#
# and then, importing the certificate, passes the CERTIFICATE's password to the call that
# needs the KEYCHAIN's:
#
#     ["set-key-partition-list", "-S", "apple-tool:,apple:", "-s", "-k", password, keychainFile]
#                                                                       ^ cscKeyPassword, line 168
#
# Two different secrets. The call fails with "SecKeychainUnlock: The user name or passphrase
# you entered is not correct", and it takes the whole build down after packaging, the arch
# prune and the fuses have all succeeded. The mac leg had not signed since 08/09/2026.
#
# The way out is in electron-builder itself: `macPackager.js:49` falls back to
# `process.env.CSC_KEYCHAIN` and creates NOTHING when no certificate is handed to it. So we
# build the keychain with ONE password for both roles, put the identity in it, and the
# caller unsets `CSC_LINK`/`CSC_KEY_PASSWORD` so that fallback is the path taken.
#
# ⚠️ The keychain password never leaves this process: it is generated here, used three
# times, and dies with the runner. `CSC_KEY_PASSWORD` still unlocks nothing but the .p12.
set -euo pipefail

: "${CSC_LINK:?mac-keychain: CSC_LINK is required (base64 .p12, or a path to one)}"
: "${CSC_KEY_PASSWORD:?mac-keychain: CSC_KEY_PASSWORD is required}"
TMP="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"

KEYCHAIN="$TMP/openmasq-signing.keychain-db"
KEYCHAIN_PASSWORD="$(openssl rand -base64 32)"
P12="$TMP/openmasq-signing.p12"

# `CSC_LINK` is base64 in CI and a path when a human runs this. Decide by TRYING, since a
# path that happens to be valid base64 is not a thing but the reverse guess is a silent
# corruption: a failed decode that still wrote a file would import as an empty certificate.
if [ -f "$CSC_LINK" ]; then
  cp "$CSC_LINK" "$P12"
else
  printf '%s' "$CSC_LINK" | base64 --decode > "$P12" 2>/dev/null || {
    echo "::error::mac-keychain: CSC_LINK is neither a readable file nor valid base64" >&2
    exit 1
  }
fi
[ -s "$P12" ] || { echo "::error::mac-keychain: the decoded certificate is empty" >&2; exit 1; }

security delete-keychain "$KEYCHAIN" 2>/dev/null || true
security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
# No auto-lock: signing two arches plus notarisation runs well past the 300 s default, and a
# keychain that relocks mid-build fails with the same unhelpful passphrase error.
security set-keychain-settings -lut 21600 "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security import "$P12" -k "$KEYCHAIN" -P "$CSC_KEY_PASSWORD" \
  -T /usr/bin/codesign -T /usr/bin/productbuild
# THE line electron-builder gets wrong: `-k` is the KEYCHAIN's password. Without it every
# `codesign` call stops on a UI prompt that no CI runner can answer.
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN" >/dev/null
# `codesign` only searches the user's keychain LIST, not a file it was merely told about.
# shellcheck disable=SC2046
security list-keychains -d user -s "$KEYCHAIN" $(security list-keychains -d user | sed -e 's/^[[:space:]]*"//' -e 's/"$//')
rm -f "$P12"

echo "identities in the signing keychain:"
security find-identity -v -p codesigning "$KEYCHAIN"
security find-identity -v -p codesigning "$KEYCHAIN" | grep -q "Developer ID Application" || {
  echo "::error::mac-keychain: no 'Developer ID Application' identity after import — the certificate or its password is wrong" >&2
  exit 1
}

if [ -n "${GITHUB_ENV:-}" ]; then
  echo "CSC_KEYCHAIN=$KEYCHAIN" >> "$GITHUB_ENV"
fi
echo "$KEYCHAIN"
