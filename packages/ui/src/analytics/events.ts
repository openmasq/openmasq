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
// Idem : la langue est un enum du catalogue, pas une chaîne libre.
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

/** La FAMILLE d'un refus serveur — `operational` mélangeait une clé expirée (l'utilisateur
 *  reconnecte), un quota (on attend) et un 404 (on corrige le code) : trois tris différents
 *  sous un seul mot. Dérivée du texte d'erreur, jamais le texte lui-même. */
export type ToolErrorFamily = "auth" | "quota" | "not_found" | "bad_request" | "timeout" | "server" | "other";

/** Why a connector (OAuth) failed to connect — bounded. */
export type ConnectorErrorReason = "oauth" | "network" | "unauthorized" | "unknown";

export type TrackEvent =
  // ── app / navigation ───────────────────────────────────────────────────
  | { name: "app_open" }
  | { name: "section_change"; section: Section }
  | { name: "theme_toggle"; theme: "light" | "dark" | "blue" | "blue-dark" }
  // La langue CHOISIE dans les réglages — une locale livrée, donc un enum, jamais un
  // `navigator.language` brut (qui porte la région : « fr-CA » est un signal de lieu).
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
  // Les CORRECTIONS de l'utilisateur — la vérité terrain du moteur, par catégorie et
  // JAMAIS par valeur. « Garder en clair » = le moteur a sur-détecté (faux positif) ;
  // « Redact » manuel / ajout au Coffre depuis une sélection = il a raté (faux
  // négatif). C'est la courbe précision/rappel en usage réel, celle qu'aucun corpus
  // ne donne — et le juge de paix d'une carte « X n'est pas détecté » du board.
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
      /** false = la passe a ÉCHOUÉ (le pire cas de latence — un timeout — ne contribuait
       *  jamais à la distribution, audit 13/08) ; absent = succès (compat). */
      ok?: boolean;
      reason?: "timeout" | "unreachable" | "auth" | "error";
      /** Taille d'entrée (bucketée par le walk) — sans elle, un modèle lent et un grand
       *  document étaient indistinguables. */
      chars?: number;
    }
  // ── token usage (numeric metrics) ──────────────────────────────────────
  // `cached`/`cacheWrite` = la part de `input` servie par le cache du provider, et celle
  // écrite dedans par cet envoi. Des COMPTES, comme le reste — c'est ce qui rend
  // mesurable l'efficacité du préfixe stable (prompt système + schémas d'outils).
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
  // `loopId` (famille agentique) : UUID aléatoire par exécution de boucle, éphémère,
  // jamais persisté — il ne fait que RELIER entre eux des événements déjà émis, pour
  // que « pick vide → appel aveugle → erreur → issue » se lise en funnel au lieu de
  // se deviner en agrégats. `connector` = l'id catalogue (le `server` ne porte que le
  // transport ipc/mcp — chaque analyse re-parsait le préfixe du nom en SQL).
  | { name: "tool_called"; server: string; tool: string; connector: string; provider: string; model: string; loopId?: string }
  // A tool call failed — names + bounded enums (never args/results/raw text).
  // `family` affine `operational` (auth ≠ quota ≠ 404 : tri différent) ; `param` = le
  // PREMIER paramètre fautif (vocabulaire du schéma, jamais une valeur) ; `attempt` =
  // combien de fois CET outil a déjà mal formé ses args (mesure le rattrapage).
  | { name: "tool_error"; server: string; tool: string; reason: ToolErrorReason; connector?: string; provider?: string; model?: string; family?: ToolErrorFamily; param?: string; attempt?: number; ms?: number; loopId?: string }
  // Chaque appel dispatché, à son RETOUR — succès compris (tool_error ne voit que les
  // échecs) : c'est la durée par connecteur, et le connecteur lent avant la plainte.
  | { name: "tool_result"; connector: string; tool: string; ok: boolean; ms: number; provider: string; model: string; loopId?: string }
  // A model repeatedly malformed a tool call and didn't recover → it's likely too
  // limited for that tool. server/tool/provider/model NAMES only.
  | {
      name: "tool_struggle";
      server: string;
      tool: string;
      /** COMMENT le modèle a peiné — la moitié actionnable, déjà calculée pour l'UI et
       *  jamais transmise (audit 13/08). */
      kind?: "unknown_tool" | "arg_error" | "connector_error" | "no_tool_used";
      provider: string;
      model: string;
      loopId?: string;
    }
  // Le ROUTEUR d'outils s'est trompé : il n'a rien retenu (`empty`), ou le modèle a ensuite
  // appelé un outil qu'il n'avait pas retenu (`missed`). Sans cette mesure, ses ratés
  // étaient invisibles — le filet `load_tools` masque le symptôme, au prix de deux tours.
  // COMPTEURS et noms de connecteurs uniquement : jamais la demande de l'utilisateur.
  | {
      name: "tool_route_miss";
      // `empty` = pick vide ; `missed` = outil réel appelé hors pick ; `unreadable` = la
      // réponse du routeur n'a pas pu être lue (repli garde-tout, jamais le cooldown).
      kind: "empty" | "missed" | "unreadable";
      offered: number;
      available: number;
      connector: string;
      provider: string;
      model: string;
      loopId?: string;
    }
  // Un nom retenu par le routeur a été SAUVÉ au lieu d'être jeté : nom nu re-préfixé
  // (`bare_name`) ou service entier développé en ses outils (`connector_pick`).
  | { name: "tool_route_salvage"; kind: "bare_name" | "connector_pick"; count: number; provider: string; model: string; loopId?: string }
  // Un raté du routeur a été RATTRAPÉ par le nom : pick vide + l'utilisateur nommait un
  // connecteur connecté → ses outils sont chargés d'office. Un événement par connecteur
  // rattrapé, pour mesurer combien des `tool_route_miss` kind=empty se résolvent seuls.
  | { name: "tool_route_rescue"; connector: string; tools: number; provider: string; model: string; loopId?: string }
  // Le modèle a appelé un outil RÉEL dont le schéma n'était pas chargé (lu au catalogue,
  // `load_tools` sauté). `bounced` = les args violaient prouvablement le schéma, le
  // serveur n'a pas été touché ; `dispatched` = rien de prouvable, l'appel est parti.
  | { name: "tool_schema_blind"; server: string; tool: string; verdict: "dispatched" | "bounced"; provider: string; model: string; loopId?: string }
  // ONE summary per agentic loop run — counts + a bounded outcome, so a laborious
  // session (a model groping through hallucinated tools, empty router picks, repeated
  // clear-mode escalations) is visible in aggregate. Counts and enums ONLY.
  | {
      name: "tool_loop_summary";
      provider: string; model: string; loopId?: string;
      turns: number; toolCalls: number;
      /** Durée wall-clock du tour agentique (bucketée) — 3 tours en 20 s et 3 tours en
       *  12 min étaient la même ligne (audit 13/08). */
      ms?: number;
      /** Router: how many tools were OFFERED after routing vs the connected total. */
      routerOffered: number; routerTotal: number;
      /** `load_tools` calls naming a connector/tool that doesn't exist (count only —
       *  the invented NAME is model-generated free text and never leaves). */
      loadToolsUnknown: number;
      /** Dynamic browser redaction: calls served clear-mode vs escalated fail-closed. */
      navClear: number; navEscalated: number;
      outcome: "answered" | "exhausted" | "aborted" | "error";
      /** POURQUOI un run s'est terminé en `error` — code BORNÉ, jamais le texte brut.
       *  Sans lui, la mesure disait « 17 % des boucles meurent au premier tour, sans
       *  un seul appel d'outil » sans dire de quoi elles meurent : clé absente ?
       *  quota ? réseau ? Absent sur toute autre issue. */
      reason?: SendErrorReason | "browser_backend";
    }
  // A `run_python` execution failed — a bounded CAUSE class + bucketed duration.
  // Never the code, stdout or stderr.
  | { name: "run_python_failed"; reason: "network" | "install" | "module" | "timeout" | "runtime"; ms: number; loopId?: string }
  // Une PORTE DÉTERMINISTE a bloqué/refusé un appel d'outil — dont le refus UTILISATEUR
  // de la carte d'écriture, jusqu'ici sans aucune donnée (audit 13/08). Enums + noms
  // d'outils/connecteurs seulement, jamais un argument ni une valeur.
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
  // `found_version` = ce que le feed PROPOSE (≠ `app_version`, qui tourne) — nommé
  // pour être inconfondable dans PostHog, où `version` s'affichait « App version ».
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
