// The DESKTOP-only offline NER model: the **multilingual mBERT** token-classification model
// (q8), BUNDLED with the app and loaded 100% offline. The desktop NEVER downloads it — see
// `worker.ts` (no remote branch) and `scripts/bake-ner-models.ts` (fetch-once at BUILD time,
// sha256-verified). Mobile/bench still download via `@openmasq/redact` `NER_MODELS`; this
// override lives here so the shared package stays generic.
//
// `NER_MODEL_ID` is a BUNDLE FOLDER NAME, not a HuggingFace repo id: transformers.js loads
// it from `<cacheDir>/<id>/…` under `allowLocalModels`, so nothing is ever fetched over the
// network on the bundled path.
import { NER_WEIGHTS_SHA256 as SHARED_NER_SHA256 } from "@openmasq/redact/ner";
import { BRAND } from "@openmasq/branding";

/** Bundled-folder id for the desktop mBERT NER weights (NOT an HF repo). */
export const NER_MODEL_ID = `${BRAND.hfOrg}/bert-base-multilingual-cased-ner-hrl`;

/**
 * The IMMUTABLE upstream the bake fetches the weights from, once, at BUILD time.
 *
 * ⚠️ Provenance residual (root rule 7): `Xenova/*` is a COMMUNITY ONNX re-upload of Davlan's
 * official `bert-base-multilingual-cased-ner-hrl`, not the model author's own repo. What makes
 * it safe here is that we no longer TRUST the host: the bake pins an exact commit AND verifies
 * every byte against `NER_WEIGHTS_SHA256` below, so a repointed/compromised repo cannot
 * substitute bytes — it can only fail the build. The rule's preferred end state is a
 * first-party re-export from Davlan's weights, vendored + pinned the same way; that is a
 * tracked follow-up, not a blocker, because the sha256 pin already carries the integrity.
 *
 * ⚠️ **LICENCE, verified at the source (2026-09-09).** Davlan's model card declares
 * **AFL-3.0** — not Apache-2.0, which `NOTICE` claimed until it was corrected. The base
 * `google-bert/bert-base-multilingual-cased` is Apache-2.0, but the FINE-TUNE carries its
 * own author's terms. The Xenova re-export declares NO licence at all, which is one more
 * reason the first-party re-export is the end state: it would take the terms from the
 * author rather than from a repo that states none. Whether AFL-3.0 sits comfortably beside
 * this project's Apache-2.0 for redistribution is a question for someone qualified to
 * answer it — it is recorded here, not decided here.
 */
export const NER_UPSTREAM = Object.freeze({
  repo: "Xenova/bert-base-multilingual-cased-ner-hrl",
  /** Reviewed commit — an immutable, content-addressed ref (never `main`). */
  revision: "263e82c06569c8c2ac46238a7ae5107598934234",
});

/**
 * sha256 (hex) of each bundled weight file, RELATIVE to the model dir. Verified TWICE:
 *  1. by the bake (`scripts/bake-ner-models.ts`) when it stages the files into the app
 *     resources — a mismatch REFUSES to bake, so bad bytes never reach a build;
 *  2. by the worker before onnxruntime parses them (`verify.ts` `verifyWeights`) — so a
 *     tampered ON-DISK model in an installed app is rejected too.
 * Fail-closed at both ends. The NER analogue of `@openmasq/redact`'s `OCR_TRAINEDDATA_SHA256`.
 *
 * The MAP ITSELF is single-sourced from `@openmasq/redact/ner` (rule 9): the extension's
 * runtime `VerifiedModelCache` verifies the SAME pins for the SAME commit — two integrity
 * gates, one source of truth.
 */
export const NER_WEIGHTS_SHA256: Readonly<Record<string, string>> = SHARED_NER_SHA256.multilingual;
