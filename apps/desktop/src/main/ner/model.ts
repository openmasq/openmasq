// The DESKTOP-only offline NER model: our **6-layer multilingual student** (q8), BUNDLED with
// the app and loaded 100% offline. The desktop NEVER downloads it — see
// `worker.ts` (no remote branch) and `scripts/bake-ner-models.ts` (fetch-once at BUILD time,
// sha256-verified). Mobile/bench still download via `@openmasq/redact` `NER_MODELS`; this
// override lives here so the shared package stays generic.
//
// `NER_MODEL_ID` is a BUNDLE FOLDER NAME, not a HuggingFace repo id: transformers.js loads
// it from `<cacheDir>/<id>/…` under `allowLocalModels`, so nothing is ever fetched over the
// network on the bundled path.
import { NER_WEIGHTS_SHA256 as SHARED_NER_SHA256 } from "@openmasq/redact/ner";
import { BRAND } from "@openmasq/branding";

/** Bundled-folder id for the desktop NER weights (NOT an HF repo). */
export const NER_MODEL_ID = `${BRAND.hfOrg}/ner-multilingual`;

/**
 * The IMMUTABLE upstream the bake fetches the weights from, once, at BUILD time.
 *
 * **Provenance: first-party.** These weights are OURS — a 6-layer distillation of Davlan's
 * mBERT, trained in the `openmasq-model` repository and published from it. That closes the
 * root-rule-7 residual this comment used to carry: the bake no longer reads a `Xenova/*`
 * COMMUNITY re-upload of somebody else's fine-tune, a repo that declared no licence of its own.
 * What has NOT changed, and must not: the pin. A repo we control is still a remote host, an
 * account is still credentials, and the sha256 gate below is what makes a repointed or
 * compromised repo able only to FAIL a build, never to substitute bytes.
 *
 * **LICENCE: Apache-2.0.** The student is initialised from
 * `google-bert/bert-base-multilingual-cased` (Apache-2.0) and contains no parameter of any
 * other model; it was trained to imitate the OUTPUTS of Davlan's AFL-3.0 fine-tune. Whether
 * learning from a model's answers makes a derivative of it is a contested question this
 * comment does not settle — the model card states the provenance so a reader can judge, and
 * the previous release in the same repo (initialised FROM Davlan's weights) said AFL-3.0 for
 * exactly that reason. What is settled: the terms now come from us, not from a third-party
 * re-upload that stated none.
 */
export const NER_UPSTREAM = Object.freeze({
  repo: "openmasq/ner-multilingual",
  /** Reviewed commit — an immutable, content-addressed ref (never `main`). */
  revision: "8cf72739a75da1de5680ea6c30c381660e740303",
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
