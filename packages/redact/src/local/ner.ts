// OPTIONAL inference entry for the local NER detector — the ONLY place the heavy
// deps (`@huggingface/transformers` / onnxruntime, model weights) are touched.
// Everything is lazy-`import()`ed so it never loads unless local NER runs, and is
// imported only via the `@openmasq/redact/ner` entry (never the main barrel).
//
// Uses a specialised **BERT token-classification** model (transformers.js), which
// — unlike GLiNER's browser-only onnxruntime-web — runs in BOTH Node (Electron
// main, via onnxruntime-node) AND a browser/WebView (onnxruntime-web), so the same
// code serves desktop main, the extension offscreen doc, and a Capacitor WebView.
// For fixed classic entities (person/org/location) a specialised NER beats GLiNER's
// zero-shot on precision; structured PII (email/phone/…) stays with the regex rules.
//
// The model is fetched by transformers.js on FIRST use and cached under `cacheDir`
// (ship the files as app assets + set `allowLocalModels` for a 100% offline app).
// Failures throw a clear Error the caller catches (detection degrades to the rules).
import type { NerPredict, LocalSpan } from "./chunker";
import { titleCase, needsRecase } from "../util";
import { mergeRuns, locateRun, type RawNerEntity } from "./nerRuns";

export type { NerPredict, LocalSpan } from "./chunker";
export type { RawNerEntity } from "./nerRuns";

/** Minimal pipeline surface — inject your own to bypass the transformers.js loader. */
export type NerPipeline = (
  text: string,
  opts?: Record<string, unknown>,
) => Promise<RawNerEntity[] | RawNerEntity[][]> | RawNerEntity[] | RawNerEntity[][];

/** The selectable models: a HF token-classification id + rough size hint. */
export const NER_MODELS = {
  multilingual: "Xenova/bert-base-multilingual-cased-ner-hrl",
} as const;

export type NerModelKey = keyof typeof NER_MODELS;

/**
 * Pinned commit SHA for the NER repo (audit M10 residual). A DOWNLOADED model — the mobile/web
 * onnxruntime-web path — otherwise tracks the mutable HuggingFace `main` ref, so a repointed repo
 * would load arbitrary ONNX weights into onnxruntime. Anchoring the download to a reviewed commit
 * closes that. (The DESKTOP never downloads at all — packaged OR dev: it BUNDLES this same mBERT,
 * fetched once at BUILD time and sha256-verified at both bake and load. See
 * `apps/desktop/src/main/ner/model.ts` + `ner/CLAUDE.md`. The pin here covers mobile/web only.)
 * An explicit `revision` / `OPENMASQ_NER_REVISION` still overrides; a custom `modelName` opts out.
 */
export const NER_REVISIONS: Record<NerModelKey, string> = {
  multilingual: "263e82c06569c8c2ac46238a7ae5107598934234",
};

/**
 * sha256 (hex) of every weight file the q8 token-classification pipeline reads,
 * keyed by path RELATIVE to the model dir, recorded from the reviewed commit in
 * `NER_REVISIONS`. The SINGLE source (rule 9) both integrity gates verify against:
 * the desktop bake + load-time check (`apps/desktop/src/main/ner`) and the
 * extension's runtime `VerifiedModelCache` (fetch → sha256 → only then parse).
 * Adding a file the pipeline requests means pinning it here too.
 */
export const NER_WEIGHTS_SHA256: Record<NerModelKey, Readonly<Record<string, string>>> = {
  multilingual: Object.freeze({
    "onnx/model_quantized.onnx": "5b65139844be260b624a2a13782b01d122e613d64ce16ed0ba4d82e0b816f1a9",
    "config.json": "7aa891abae067f95a40f5e2005b3de44824a083f256802934a993d301ec25076",
    "tokenizer.json": "bf1b59b7b11c95f194f51708d918eea378e09d05f84c0e1656dc5180e8117088",
    "tokenizer_config.json": "e6f3b96db926a37d4039995fbf5ad17de158dfb8f6343d607e4dbaad18d75f5a",
  }),
};

export interface CreateNerPredictOptions {
  /** Which bundled model to load (ignored when `pipeline` is injected). */
  modelKey?: NerModelKey;
  /** Explicit HF token-classification model id; overrides `modelKey`. */
  modelName?: string;
  /** Quantisation. `q8` (~¼ size, negligible NER loss) is the sane default. */
  dtype?: "fp32" | "fp16" | "q8" | "int8" | "uint8";
  /** transformers.js device hint ("cpu" default in Node; "webgpu" in a WebView). */
  device?: string;
  /** Where to cache downloaded weights (Node). */
  cacheDir?: string;
  /** Load the model from local app assets only (no network) — for offline installs. */
  allowLocalModels?: boolean;
  /** Pin the HF repo REVISION (a commit SHA) instead of the mutable `main` ref (audit
   *  M10): a DOWNLOADED model (dev-desktop, or the mobile/web onnxruntime-web path)
   *  otherwise tracks whatever `main` points to, with no integrity anchor. The packaged
   *  desktop instead BUNDLES a self-exported model loaded via `modelName` +
   *  `allowLocalModels` and sha256-verified at load, so this covers the download path.
   *  Falls back to the `OPENMASQ_NER_REVISION` env, then the transformers.js default (`main`). */
  revision?: string;
  /** Inject a ready pipeline to skip the built-in transformers.js loader. */
  pipeline?: NerPipeline;
}

async function loadDefaultPipeline(opts: CreateNerPredictOptions): Promise<NerPipeline> {
  let mod: any;
  try {
    mod = await import("@huggingface/transformers");
  } catch (cause) {
    throw new Error(
      "Local NER requires the optional dependency '@huggingface/transformers'. " +
        "Install it with `pnpm add @huggingface/transformers` (or inject your own " +
        "pipeline via options.pipeline).",
      { cause },
    );
  }
  if (opts.cacheDir && mod.env) mod.env.cacheDir = opts.cacheDir;
  if (opts.allowLocalModels !== undefined && mod.env) {
    mod.env.allowLocalModels = opts.allowLocalModels;
    mod.env.allowRemoteModels = !opts.allowLocalModels;
  }
  // Fall back to the multilingual model for an unknown/legacy key (e.g. a stale
  // "multi_pii" from the GLiNER era persisted in settings) so it never crashes.
  const key = (opts.modelKey && opts.modelKey in NER_MODELS ? opts.modelKey : "multilingual") as NerModelKey;
  const modelName = opts.modelName ?? NER_MODELS[key];
  // Pin the repo revision to a reviewed commit SHA (audit M10): anchors the download's integrity
  // instead of the mutable HF `main`. Precedence: explicit opts.revision > OPENMASQ_NER_REVISION env
  // > the pinned default for a KNOWN model (skipped for a custom `modelName` — a different repo).
  const defaultRevision = opts.modelName ? undefined : NER_REVISIONS[key];
  const revision = opts.revision ?? process.env.OPENMASQ_NER_REVISION ?? defaultRevision;
  const pipe = await mod.pipeline("token-classification", modelName, {
    dtype: opts.dtype ?? "q8",
    ...(opts.device ? { device: opts.device } : {}),
    ...(revision ? { revision } : {}),
  });
  return pipe as NerPipeline;
}

/**
 * Build a {@link NerPredict} bound to a loaded model. The returned fn runs the
 * pipeline over ONE chunk and turns each aggregated entity into a {@link LocalSpan}
 * by locating its (cleaned) word verbatim in the chunk — the pipeline doesn't emit
 * char offsets, and the offset only needs to extract the value (`pseudonymize`
 * replaces by value, so every occurrence is caught regardless). Load once per model
 * choice and reuse it across turns (the model stays warm).
 */
export async function createNerPredict(
  options: CreateNerPredictOptions = {},
): Promise<NerPredict> {
  const pipeline = options.pipeline ?? (await loadDefaultPipeline(options));
  return async (text: string): Promise<LocalSpan[]> => {
    // Run the model on the text as-is, and — when it's mostly uppercase (an admin
    // form / address block, where a CASED model badly under-detects) — ALSO on a
    // title-cased variant. Every entity is located back in the ORIGINAL text, so
    // the returned value keeps its real casing (verbatim, redactable).
    const variants = needsRecase(text) ? [text, titleCase(text)] : [text];
    const lower = text.toLowerCase();
    const out: LocalSpan[] = [];
    const byKey = new Map<string, LocalSpan>();
    for (const variant of variants) {
      // `aggregation_strategy: "none"` (per-token) + our own `mergeRuns` — NOT "simple",
      // whose `B-`-boundary rule shatters a subword-fragmented word (see `mergeRuns`). An
      // injected mock ignores the option and returns its pre-aggregated words; `mergeRuns`
      // (no `index`) leaves those one-per-run, so mocks/tests behave as before.
      const raw = await pipeline(variant, { aggregation_strategy: "none" });
      const list = (Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : raw) as RawNerEntity[];
      const seenThisPass = new Set<string>();
      for (const run of mergeRuns(list)) {
        const at = locateRun(lower, run.subwords);
        if (!at || at.end - at.start < 2) continue; // not verbatim in the chunk → never touch it
        const key = `${run.label}:${at.start}:${at.end}`;
        if (seenThisPass.has(key)) continue; // a same-pass repeat is not corroboration
        seenThisPass.add(key);
        const prior = byKey.get(key);
        if (prior) {
          prior.agreed = true; // the OTHER pass found it too — the two reads agree
          continue;
        }
        // When the recased second read is armed, a span starts as agreed=false and is
        // promoted above if the other pass confirms it. On a single-pass text `agreed`
        // stays absent: not running a second read is not evidence of doubt (the same
        // convention as `bench/confidence.bench.ts`).
        const span: LocalSpan = { start: at.start, end: at.end, label: run.label, score: run.score };
        if (variants.length > 1) span.agreed = false;
        byKey.set(key, span);
        out.push(span);
      }
    }
    return out;
  };
}
