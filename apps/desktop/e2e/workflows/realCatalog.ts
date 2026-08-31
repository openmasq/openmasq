// The REAL suite's catalog: the prompts from the `../tofix/` folder — actual
// sessions where something went wrong (plaintext data, double send
// after a mid-way failure, looping on Neon, empty router). Each entry replays
// the prompt as-is against the REAL connectors and pins the invariant
// the incident violated. Real writes are accepted (dev workspace) and
// write prompts mark their content "[test e2e]" to stay identifiable.

import { BRAND } from "@openmasq/branding";

export interface RealWorkflow {
  id: string;
  /** The original prompt (tofix), possibly bounded to stay harmless. */
  prompt: string;
  /** Expected tool prefix connected before sending (sync point). */
  needsTool: string;
  /** The ONLY connectors to reconnect for this test (`OPENMASQ_E2E_MCP_ONLY`).
   *  ~20 tools instead of 450: shorter startup, short prompt, trivial
   *  router — the test becomes fast AND reproducible. Empty ⇒ the whole account
   *  (useful to reproduce a "full catalog" incident identically). */
  connectors?: string[];
  /** Tools whose SYSTEM confirmation must be REFUSED (never executed). */
  refuse?: RegExp;
  /** Writes whose system confirmation is expected AT MOST `max` times —
   *  `max: 1` is the anti-double-send assertion (the "2 emails" bug: a mid-way
   *  failure redoes the action already done → 2nd confirmation → counter at 2). */
  writes?: { tool: RegExp; max: number }[];
}

export const REAL_WORKFLOWS: RealWorkflow[] = [
  {
    // tofix/errorbrowser.md — "EMPTY router pick (0/341)": the loop kept
    // hitting the catalog, the answer never landed. Pure read (stocks via
    // run_python/yfinance): nothing to confirm, nowhere to write.
    id: "etf-pea",
    prompt:
      "Affiche l'évolution de la valeur des 5 ETF éligibles au PEA les plus performants de l'année.",
    needsTool: "run_python",
    connectors: [],  // no connector: run_python is enough (stocks via yfinance)
  },
  {
    // tofix/failneon.md — 640k input tokens (loop) on "list of
    // users in the neon db": the REAL users' emails surface
    // in the tool results → they must go back to the model REDACTED
    // (REAL_PII sentinels on the wire). And NO Neon write must
    // execute: every `neon__*` confirmation is refused (the CSV is generated
    // locally via run_python, not in the DB).
    id: "neon-csv",
    prompt: "crée un csv comportant la liste des utilisateurs en bdd sur neon",
    needsTool: "neon__",
    connectors: ["neon"],
    refuse: /^neon__/,
  },
  {
    // tofix/posthog.md — PostHog report then Slack send: this is the
    // "failure midway → sent TWICE" case. The Slack send must be confirmed
    // system-side AT MOST once, whatever happens upstream.
    id: "posthog-slack",
    prompt:
      `Fait un rapport d'utilisation de ${BRAND.name} sur posthog et envoie le sur slack ` +
      "(commence le message par [test e2e]).",
    needsTool: "posthog__",
    connectors: ["posthog", "slack"],
    writes: [{ tool: /^slack__/, max: 1 }],
  },
  {
    // tofix/tancent.md — Sentry errors → Linear ticket (session interrupted then
    // resumed within the incident). One single ticket, confirmed only once.
    id: "sentry-linear",
    prompt:
      "regarder les erreurs sur sentry et crée un ticket sur linear " +
      "(préfixe le titre du ticket par [test e2e]).",
    needsTool: "sentry__",
    connectors: ["sentry", "linear"],
    writes: [{ tool: /^linear__/, max: 1 }],
  },
];
