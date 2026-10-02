/**
 * WHICH files the i18n ratchet (`check-i18n.mjs`) reads — the definition, once, so a test
 * can pin it (`i18nScope.test.ts`).
 *
 * `agent/` holds BOTH prose for the MODEL (it follows the conversation's language) and UI
 * copy (tool-step labels, stop notices). A blanket skip hid the UI half, so the rule is
 * now an ALLOW-list of what is NOT UI: every other `agent/` file is covered by default.
 * Listing a file here claims the user never reads its literals (model prose, debug-log
 * labels). A new agent/ file carrying copy fails the gate until it is localised or listed.
 */
export const AGENT_NOT_UI = [
  "batchReads.ts",
  "identifierTypo.ts",
  "integrationMatch.ts",
  "mcpAgent/afterCall.ts",
  "mcpAgent/callModel.ts",
  "mcpAgent/context.ts",
  "mcpAgent/dispatch.ts",
  "mcpAgent/gates/confirm.ts",
  "mcpAgent/gates/decide.ts",
  "mcpAgent/gates/precheck.ts",
  "mcpAgent/gates/refusals.ts",
  "mcpAgent/interceptedFetch.ts",
  "mcpAgent/interceptedPython.ts",
  "mcpAgent/runLoop.ts",
  "mcpAgent/selectTools.ts",
  "mcpAgent/turn.ts",
  "mcpAgentGuidance.ts",
  "mcpAgentPython.ts",
  "mcpAgentUtil.ts",
  "mcpAgentWatchdog.ts",
  "navClearRedact.ts",
  "prefetch.ts",
  "readIntent.ts",
  "suggestIntegrations.ts",
  "toolCatalog.ts",
  "toolRedactionPolicy.ts",
].map((f) => `packages/ui/src/agent/${f}`);

/** Zones EXCLUDED wholesale (see `check-i18n.mjs`'s header). */
export const I18N_EXCLUDE = [
  /\.(test|spec)\.tsx?$/,
  /\/evals\//,
  /\/prompt\//,
  /^packages\/emails\/i18n\//,
  /^packages\/emails\/scripts\//,
  // The model REGISTRY: `label` there is a PROPER noun ("GPT-5.5", "Claude Opus"),
  // and its provider `desc` names brands — nothing to translate, everything would be noise.
  /^packages\/llm\/src\/models\//,
];

/** True when the ratchet reads this (tracked, in-root) file. */
export function inI18nScope(file) {
  if (I18N_EXCLUDE.some((re) => re.test(file))) return false;
  return !AGENT_NOT_UI.includes(file);
}
