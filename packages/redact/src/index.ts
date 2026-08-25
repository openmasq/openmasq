/**
 * @openmasq/redact — reversible scrubbing of sensitive data (emails, API keys,
 * tokens, names, …).
 *
 * Used as a privacy proxy: text is redacted before it leaves the machine (the
 * model only ever sees placeholders / fake data), and the model's reply is
 * *un-redacted* with the same {@link Vault} so the user sees their real data
 * restored.
 *
 * This file is the public barrel — the engine is split into focused modules:
 *   - `types`            shared type vocabulary
 *   - `kinds`            type/category → colour-bucket classifier
 *   - `engine/`          deterministic regex engine (rules, redact, vault)
 *   - `model/`           model-based detection + pseudonymisation (fake data)
 *   - `highlight/`       text → coloured redaction segments (for the UI)
 *   - `numbers/`         n-token arithmetic the model answers with
 *   - `documents` entry  extract text from files (see ./documents)
 */

export type {
  RedactionType,
  RedactionRule,
  RedactionMatch,
  RedactionKind,
  RedactionCategory,
  RedactionResult,
  Vault,
  RedactOptions,
  RedactionTone,
  RedactionSegment,
  CompletionMessage,
  CompleteFn,
  Detection,
} from "./types";

export { redactionKind, redactionCategory, URL_EXEMPT_KINDS } from "./kinds";
export { REDACT_TYPES, type RedactType } from "./redactTypes";
export { escapeRegExp, replaceStandalone, hasStandalone, isWordGlued, entityVariantRegex, variantOccurrences, entityKey } from "./util";
export { RULES } from "./engine/rules";
export { redact, redactText } from "./engine/redact";
export { detectPhones, type PhoneMatch } from "./engine/phones";
export {
  detectUrlSpans,
  detectHostedUrlSpans,
  occursOutsideUrl,
  urlOccurrenceGuard,
  type UrlOccurrenceGuard,
} from "./engine/urls";
export { batchRedact } from "./engine/batch";
export { detectLabeledFields } from "./engine/contextFields";
export { detectHonorificNames } from "./engine/honorifics";
export { detectOrgContext } from "./engine/orgContext";
export { detectAddresses } from "./engine/addresses";
export { detectFrGeo, DEPARTMENTS, REGIONS, depToRegion } from "./engine/frGeo";
export { unredact, applyVault, applyVaultVariants, replayVault, disabledVaultTokens } from "./engine/vault";
export { unredactArgs, unredactReply } from "./engine/vaultArgs";
export { containsCredentialShaped } from "./engine/credScan";
export {
  toSegments,
  compileVault,
  segmentsWith,
  wireSegments,
  redactionCounts,
  toneForKind,
  hueForKind,
  hueForTone,
  CATEGORY_HUE,
  spanKindLabel,
  type VaultMatcher,
} from "./highlight/segments";
// Display tokens (« [PERSON1] », « [IBAN] ») for redacted spans — RENDER-only, the wire
// and the vault never see them; the `redactTokenDisplay` setting's whole vocabulary.
export {
  CATEGORY_TOKEN,
  assignDisplayTokens,
  vaultDisplayTokens,
  replacementDisplayTokens,
  type TokenSpan,
} from "./highlight/tokens";
// The redaction palette's single source: one hue per redaction SECTION. `CATEGORY_HUE`
// above is derived from it — never declare a colour beside these.
export {
  REDACTION_SECTIONS,
  SECTION_HUE,
  CATEGORY_SECTION,
  type Hue,
  type RedactionSection,
} from "./highlight/sections";
export { discoverSecrets, type DiscoverOptions } from "./model/detect";
// The curated deny-lists + CJK test, for consumers whose matching must agree with the
// engine's notion of "generic word" / "CJK morpheme" (rule 9: import, never re-declare).
export { isStopword, isGenericTerm } from "./model/detect";
// Le cœur DISTINCTIF d'un nom d'organisation (affixes légaux/génériques retirés des
// deux bouts) — consommé par la Mémoire pour que « Atelier Torbel SARL » retrouve la
// carte « Atelier Torbel » au lieu d'en créer une seconde (règle 9 : réutilisé, pas copié).
export { stripOrgAffixes, isNonPiiTerm } from "./model/genericTerms";
export { isCjkText } from "./util";
export { pseudonymize, type PseudonymizeOptions } from "./model/pseudonymize";
export {
  isNotoriousEntity,
  NOTORIOUS_PEOPLE,
  NOTORIOUS_COMMERCIAL_ORGS,
  type NotorietyOpts,
} from "./model/notorious";
export { nameGender } from "./model/gender";
// Local, LLM-free NER detector (BERT / transformers.js). Pure orchestration only —
// the heavy inference lives behind the separate `@openmasq/redact/ner` entry.
export {
  detectLocalNer,
  nerLabelToCategory,
  CharacterChunker,
  dedupe,
  type LocalDetectOptions,
  type LocalSpan,
  type NerPredict,
  type ChunkerOptions,
} from "./local";
export { NUMBER_TOKEN_INSTRUCTION, computeTokenFormulas } from "./numbers/formulas";
