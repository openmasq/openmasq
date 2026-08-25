// Typed send failures + their user-facing wording. Split by role: `classes.ts` =
// the fail-closed Error classes the pipeline throws; `humanize.ts` = the FR
// wording layer (and its writing rules, at its top). Same import path as before —
// every consumer resolves `../state/errors` to this barrel.
export {
  MissingApiKeyError,
  RedactionUnavailableError,
  ModelBlockedByOrgError,
  CreditsExhaustedError,
  RateLimitError,
} from "./classes";
export {
  isRateLimitError,
  humanizeSendError,
  formatReset,
  cleanErrorText,
  sendErrorReason,
  sendErrorAction,
} from "./humanize";
