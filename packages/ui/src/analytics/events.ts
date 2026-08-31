/**
 * The privacy-safe event catalogue. Every trackable event is a member of this
 * discriminated union with EXACTLY its allowed fields — so the type system makes
 * it impossible to attach prompt text, real PII, vault values, tool args/results,
 * API keys or any free-form payload. Only counts, enums and local ids are ever
 * declared. New events MUST be added here (and to ALLOWED in sanitize.ts) before
 * they can be emitted. See packages/ui — privacy notes.
 */

// The ONE section vocabulary (rule 9). Type-only, so this catalogue stays
// dependency-free at runtime; adding a screen can't leave `section_change` behind.
import type { Section } from "../types";
// Likewise: the language is a catalogue enum, never a free string.
import type { Locale } from "@openmasq/i18n";

/** Why a chat send failed — a BOUNDED code (never the raw error text). */
export type SendErrorReason =
  | "rate_limit"
  | "network"
  | "auth"
  | "missing_key"
  | "server"
  // A 4xx the provider rejected (malformed/unsupported request — e.g. a param the
  // model deprecated). Actionable: it's a client-side bug, not a transient fault.
  | "bad_request"
  // The account behind the user's OWN key ran out of money (OpenAI insufficient_quota,
  // Anthropic "credit balance is too low"). Neither a rate limit (its 429 clothing) nor
  // a bad request (its 400 clothing) — kept apart so billing friction is countable.
  | "provider_credits"
  | "unknown";

/** Why a tool call failed — bounded. `arg_error` = the model malformed the call
 *  (missing/empty/invalid args); `operational` = the server refused (auth/quota/
 *  not-found); `transport` = couldn't reach the server. */
export type ToolErrorReason =
  | "arg_error"
  | "operational"
  | "transport"
  | "unknown"
  // A deterministic capability fault of the agent-browser backend (e.g. Electron
  // can't create a CDP page target) — tracked apart from generic transport so a
  // browser-infra regression is visible without trawling raw errors.
  | "browser_backend";

/** The FAMILY of a server refusal — `operational` used to lump together an expired key
 *  (the user reconnects), a quota (you wait) and a 404 (you fix the code): three different
 *  triages under one word. Derived from the error text, never the text itself. */
export type ToolErrorFamily = "auth" | "quota" | "not_found" | "bad_request" | "timeout" | "server" | "other";

/** Why a connector (OAuth) failed to connect — bounded. */
export type ConnectorErrorReason = "oauth" | "network" | "unauthorized" | "unknown";

export type TrackEvent =
  // ── app / navigation ───────────────────────────────────────────────────
  | { name: "app_open" }
  | { name: "section_change"; section: Section }
  | { name: "theme_toggle"; theme: "light" | "dark" | "blue" | "blue-dark" }
  // The language CHOSEN in settings — a shipped locale, so an enum, never a raw
  // `navigator.language` (which carries the region: « fr-CA » is a location signal).
  | { name: "language_change"; locale: Locale }
  // ── conversations ──────────────────────────────────────────────────────
  | { name: "new_chat" }
  | { name: "select_conversation"; id: string } // local uid, not sensitive
  | { name: "delete_conversation"; id: string }
  // ── messaging ──────────────────────────────────────────────────────────
  | { name: "send_message"; chars: number; redactions?: number; provider?: string; model?: string } // chars is bucketed
  | { name: "stop" }
  | { name: "regenerate" }
  | { name: "copy_reply" }
  // « Votre avis » opened from a reply's action row. The count is the only way to
  // know whether putting it there actually earns reports — the whole point of the
  // affordance. No id, no content: it says "someone started one", nothing else.
  | { name: "avis_from_message" }
  // A send failed — provider/model + a BOUNDED reason code (no raw message) +
  // the HTTP status when the failure was an API response (safe metadata, no PII).
  // `requestId` = the gateway's opaque correlation id (server-minted, content-free) —
  // joins this client event to the gateway's `inference_upstream_error`, which holds
  // the REAL upstream reason. `retries` = attempts the provider client made.
  | { name: "send_error"; provider: string; model: string; reason: SendErrorReason; status?: number; requestId?: string; retries?: number }
  // ── models ─────────────────────────────────────────────────────────────
  | { name: "change_model"; provider: string; model: string }
  | { name: "default_model_set"; model: string }
  // ── redaction (counts/enums only — never values) ───────────────────────
  | { name: "redaction_applied"; count: number; kinds: string[] }
  // The user's CORRECTIONS — the engine's ground truth, by category and NEVER by
  // value. « Garder en clair » = the engine over-detected (false positive);
  // manual « Redact » / adding to the Coffre from a selection = it missed (false
  // negative). This is the real-usage precision/recall curve, the one no corpus
  // gives — and the tie-breaker for an « X isn't detected » board card.
  | { name: "redaction_kept"; kind: string }
  | { name: "redaction_forced"; kind: string; source: "selection" | "document" | "coffre" }
  | { name: "engine_used"; engine: "patterns" | "model" }
  | { name: "redaction_fallback_regex" }
  // Redaction-step latency: how long the detection model took. `ms` is BUCKETED
  // (never the raw value); `model` is a model id (not PII); `cold` marks the first
  // local-NER call in the session (includes the one-time weight load). No text,
  // no counts of what was found — pure perf telemetry.
  | {
      name: "redaction_timing";
      engine: "local" | "model" | "remote";
      model: string;
      ms: number;
      cold?: boolean;
      /** false = the pass FAILED (the worst latency case — a timeout — never used to
       *  contribute to the distribution, audit 13/08); absent = success (compat). */
      ok?: boolean;
      reason?: "timeout" | "unreachable" | "auth" | "error";
      /** Input size (bucketed by the walk) — without it, a slow model and a large
       *  document were indistinguishable. */
      chars?: number;
    }
  // ── token usage (numeric metrics) ──────────────────────────────────────
  // `cached`/`cacheWrite` = the share of `input` served from the provider's cache, and the
  // share written into it by this send. COUNTS, like everything else — this is what makes
  // the stable prefix's efficiency (system prompt + tool schemas) measurable.
  | { name: "token_usage"; provider: string; model: string; input: number; output: number; cached?: number; cacheWrite?: number }
  // Model RESPONSE latency: time-to-first-token (bucketed) + throughput (tokens/s,
  // a rate, not identifying). `tools` = the agentic (MCP) path vs a plain stream.
  // `toolCount` = how many MCP tools were connected/offered this turn and `inputTokens`
  // = the prompt/prefill size — the two knobs that DRIVE a huge TTFT (a big tool
  // payload prefills for seconds/minutes before the first token). No content.
  | { name: "model_latency"; provider: string; model: string; ttftMs: number; tokensPerSec: number; output: number; tools: boolean; toolCount: number; inputTokens: number }
  // ── MCP (names/ids only — never tool args or results) ──────────────────
  | { name: "connector_connect"; provider: string }
  | { name: "connector_disconnect"; provider: string }
  | { name: "connector_error"; provider: string; reason: ConnectorErrorReason }
  // `loopId` (agentic family): a random UUID per loop run, ephemeral,
  // never persisted — it only LINKS together events already emitted, so
  // « empty pick → blind call → error → outcome » reads as a funnel instead of
  // being guessed from aggregates. `connector` = the catalogue id (`server` only carries the
  // ipc/mcp transport — every analysis used to re-parse the name's prefix in SQL).
  | { name: "tool_called"; server: string; tool: string; connector: string; provider: string; model: string; loopId?: string }
  // A tool call failed — names + bounded enums (never args/results/raw text).
  // `family` refines `operational` (auth ≠ quota ≠ 404: different triage); `param` = the
  // FIRST faulty parameter (schema vocabulary, never a value); `attempt` =
  // how many times THIS tool has already malformed its args (measures the recovery).
  | { name: "tool_error"; server: string; tool: string; reason: ToolErrorReason; connector?: string; provider?: string; model?: string; family?: ToolErrorFamily; param?: string; attempt?: number; ms?: number; loopId?: string }
  // Every dispatched call, on its RETURN — successes included (tool_error only sees
  // failures): this is the per-connector duration, and the slow connector before the complaint.
  | { name: "tool_result"; connector: string; tool: string; ok: boolean; ms: number; provider: string; model: string; loopId?: string }
  // A model repeatedly malformed a tool call and didn't recover → it's likely too
  // limited for that tool. server/tool/provider/model NAMES only.
  | {
      name: "tool_struggle";
      server: string;
      tool: string;
      /** HOW the model struggled — the actionable half, already computed for the UI and
       *  never transmitted (audit 13/08). */
      kind?: "unknown_tool" | "arg_error" | "connector_error" | "no_tool_used";
      provider: string;
      model: string;
      loopId?: string;
    }
  // The tool ROUTER got it wrong: it picked nothing (`empty`), or the model then
  // called a tool it hadn't picked (`missed`). Without this measure, its misses
  // were invisible — the `load_tools` safety net masks the symptom, at the cost of two turns.
  // COUNTERS and connector names only: never the user's request.
  | {
      name: "tool_route_miss";
      // `empty` = empty pick; `missed` = a real tool called outside the pick; `unreadable` = the
      // router's response couldn't be read (catch-all fallback, never the cooldown).
      kind: "empty" | "missed" | "unreadable";
      offered: number;
      available: number;
      connector: string;
      provider: string;
      model: string;
      loopId?: string;
    }
  // A name picked by the router was SALVAGED instead of discarded: a bare name re-prefixed
  // (`bare_name`) or a whole service expanded into its tools (`connector_pick`).
  | { name: "tool_route_salvage"; kind: "bare_name" | "connector_pick"; count: number; provider: string; model: string; loopId?: string }
  // A router miss was RESCUED by name: empty pick + the user named a
  // connected connector → its tools are loaded automatically. One event per connector
  // rescued, to measure how many `tool_route_miss` kind=empty resolve on their own.
  | { name: "tool_route_rescue"; connector: string; tools: number; provider: string; model: string; loopId?: string }
  // The model called a REAL tool whose schema wasn't loaded (read from the catalogue,
  // `load_tools` skipped). `bounced` = the args provably violated the schema, the
  // server wasn't touched; `dispatched` = nothing provable, the call went out.
  | { name: "tool_schema_blind"; server: string; tool: string; verdict: "dispatched" | "bounced"; provider: string; model: string; loopId?: string }
  // ONE summary per agentic loop run — counts + a bounded outcome, so a laborious
  // session (a model groping through hallucinated tools, empty router picks, repeated
  // clear-mode escalations) is visible in aggregate. Counts and enums ONLY.
  | {
      name: "tool_loop_summary";
      provider: string; model: string; loopId?: string;
      turns: number; toolCalls: number;
      /** Wall-clock duration of the agentic turn (bucketed) — 3 turns in 20 s and 3 turns in
       *  12 min used to be the same line (audit 13/08). */
      ms?: number;
      /** Router: how many tools were OFFERED after routing vs the connected total. */
      routerOffered: number; routerTotal: number;
      /** `load_tools` calls naming a connector/tool that doesn't exist (count only —
       *  the invented NAME is model-generated free text and never leaves). */
      loadToolsUnknown: number;
      /** Dynamic browser redaction: calls served clear-mode vs escalated fail-closed. */
      navClear: number; navEscalated: number;
      outcome: "answered" | "exhausted" | "aborted" | "error";
      /** WHY a run ended in `error` — a BOUNDED code, never the raw text.
       *  Without it, the measure said « 17% of loops die on the first turn, without
       *  a single tool call » without saying what they die of: missing key?
       *  quota? network? Absent on any other outcome. */
      reason?: SendErrorReason | "browser_backend";
    }
  // A `run_python` execution failed — a bounded CAUSE class + bucketed duration.
  // Never the code, stdout or stderr.
  | { name: "run_python_failed"; reason: "network" | "install" | "module" | "timeout" | "runtime"; ms: number; loopId?: string }
  // A DETERMINISTIC GATE blocked/refused a tool call — including the USER'S refusal
  // of the write card, until now with no data at all (audit 13/08). Enums + tool/connector
  // names only, never an argument or a value.
  | {
      name: "tool_gate_blocked";
      kind: "declined" | "nav_domain" | "nav_pseudonym" | "draft_only" | "consult_only" | "already_done";
      tool: string;
      connector: string;
      provider: string;
      model: string;
      loopId?: string;
    }
  // ── files (type/size/count — never name or content) ────────────────────
  | { name: "file_attached"; mime: string; sizeBucket: string; redactions: number }
  // ── settings / onboarding ──────────────────────────────────────────────
  | { name: "setting_changed"; key: string }
  | { name: "onboarding"; step: string }
  | { name: "debug_mode_toggle"; on: boolean }
  | { name: "analytics_consent"; on: boolean }
  // ── auto-update (the FUNNEL — versions + channel only) ─────────────────
  // Emitted by the MAIN process (`updates/track.ts` → the `app:event` bridge), so
  // these are the only events not raised in the renderer. Only failures used to reach
  // PostHog (`$exception` `updater-*`), which made a SUCCESSFUL update — and, worse, an
  // update that silently never applied — completely invisible.
  // `update_install` = the user accepted the restart (we hand off to ShipIt);
  // `update_installed` = the NEXT launch found the running version actually changed.
  // The gap between those two IS the silent-failure rate, unobservable in-process
  // (the swap happens after we quit). No feed URL, no installId, no device id: a
  // version string and a channel name are the whole payload.
  // `found_version` = what the feed PROPOSES (≠ `app_version`, which is running) — named
  // to be unmistakable in PostHog, where `version` displayed as « App version ».
  | { name: "update_check"; channel: string; result: "available" | "up_to_date"; found_version?: string }
  | { name: "update_downloaded"; channel: string; version: string }
  | { name: "update_install"; channel: string; version: string }
  | { name: "update_installed"; channel: string; from: string; to: string };

export type EventName = TrackEvent["name"];

/** A sanitized event ready for a sink: name + allow-listed, bucketed properties. */
export interface CleanEvent {
  name: EventName;
  props: Record<string, string | number | boolean | string[]>;
}
