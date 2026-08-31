// What we say when a turn ends BADLY — and how we recognise it.
//
// The counterpart of `mcpAgentGuidance.ts`: that one talks to the model BEFORE it
// acts, this one reads what it returned and formulates the diagnosis for the user
// (browser fault, call cap, exhausted turn, a reply that promises to act without
// calling). Split out for rule 1, re-exported by `mcpAgentGuidance.ts`: no importer
// changes. Everything is PURE, PII-free (wire-safe) and tested by `mcpAgentGuidance.test.ts`.

import { connectorBrandName } from "@openmasq/catalog/mcp";
import { humanToolLabel } from "./humanToolLabel";
import { connectorOfTool } from "./toolStruggle";

/**
 * A tool AS SHOWN to the user: its French label and the connector's brand —
 * "**Lecture · e-mails** (Gmail)", never `gmail__get_message`.
 *
 * This message displays AS an assistant reply, to someone who wanted to read their
 * emails; a `snake_case` tool name names nothing they can recognise there, and above
 * all nothing they can act on. The vocabulary is that of the trace just above
 * (`humanToolLabel`, the one translator), so the two answer each other.
 */
function toolPhrase(name: string): string {
  const connectorId = connectorOfTool(name, "");
  const bare = name.includes("__") ? name.slice(name.indexOf("__") + 2) : name;
  const label = humanToolLabel(connectorId || "mcp", bare);
  const brand = connectorId ? connectorBrandName(connectorId) : undefined;
  return brand ? `**${label}** (${brand})` : `**${label}**`;
}

/** The repeated failure the loop retains, as `exhaustionMessage` reads it. */
export interface RepeatedFailure {
  tool: string;
  error: string;
  distinctInputs: number;
}

/**
 * Retain a repeated tool failure, so as not to blame it on the model.
 *
 * `distinctInputs` is what decides: several inputs for a single failure means the
 * model DID vary its call — it's the tool that isn't answering. We keep only the
 * FIRST useful line of the result, bounded: the error message, not the whole body.
 * `content` arrives already redacted (the loop only ever sees fakes), so wire-safe.
 */
export function repeatedFailureOf(tool: string, content: string, distinctInputs: number): RepeatedFailure {
  return {
    tool,
    error: (content.split(/\r?\n/).find((l) => l.trim()) ?? content).trim().slice(0, 160),
    distinctInputs,
  };
}

/** A deterministic CAPABILITY fault of the AGENT BROWSER backend itself — the CDP
 *  layer can't create a page target (Electron doesn't implement
 *  `Target.createTarget`), the endpoint is gone, or the protocol rejected the op.
 *  It is NOT the model (which typically varies its approach) and NOT the website —
 *  retrying, or "a more capable model", changes nothing. The loop stops on the
 *  FIRST such fault with {@link BROWSER_BACKEND_FAULT_MESSAGE} instead of burning
 *  turns and then blaming the model. The caller gates on `isBrowserTool` first, so
 *  this only inspects the error text. Pinned by `mcpAgentGuidance.test.ts`. */
export function isBrowserBackendFault(text: string): boolean {
  return /target\.createtarget|createtarget|(?:protocol error)[\s\S]{0,60}not supported|not supported[\s\S]{0,60}(?:target|createtarget)/i.test(
    text,
  );
}

/** Truthful message for a browser-backend fault: name the real culprit (the agent
 *  browser, not the model) so the user doesn't waste time switching models. */
export const BROWSER_BACKEND_FAULT_MESSAGE =
  "⚠️ Le navigateur intégré n'a pas pu ouvrir de page — panne technique du navigateur, pas du modèle.\n\n" +
  "Changer de modèle n'y changera rien : fermez puis rouvrez le navigateur (ou relancez l'app).";

/** Action word for the confirm card's journal labels, by reason — the journal used
 *  to say "Écriture autorisée" for a navigation (a lying label, journal 01/08); the
 *  card itself already states the real reason. */
export function confirmActLabel(reason: string): string {
  if (reason === "nav-exfil") return "Navigation";
  if (reason === "attachments") return "Pièces jointes";
  return "Écriture";
}

/** The result returned for EVERY call past the per-tool cap (`maxSameToolCalls`) —
 *  the call is NOT dispatched. A legitimate batch of N distinct reads must no longer
 *  kill the turn (journal 01/08: 11 `get_file_info`, whole turn aborted at the 9th
 *  when the 8 results already sufficed); the hard-stop (`exhaustionMessage`) only
 *  falls if the model INSISTS with the same tool on the NEXT response. Pinned by
 *  `mcpAgent.test.ts`. */
export function capRefusalNote(tool: string, max: number): string {
  return (
    `Limite d'appels atteinte pour \`${tool}\` dans ce tour (${max}) : cet appel n'a PAS été exécuté. ` +
    `Ne rappelle PLUS cet outil — réponds MAINTENANT à l'utilisateur avec les résultats déjà obtenus, ` +
    `en signalant explicitement ce qui n'a pas pu être vérifié.`
  );
}

/** Build the EXPLICIT end-of-turn message when the loop hits MAX_TURNS without a
 *  final answer. Diagnoses the likely cause from per-tool counters — a stuck
 *  loop (same result repeated), unrecovered arg/JSON errors, or just too many
 *  steps — and suggests a concrete next step. Tool NAMES only, never argument
 *  values → wire-safe. Pure (unit-tested). */
export function exhaustionMessage(s: {
  callCounts: Map<string, number>;
  repeatedResult: Map<string, number>;
  argErrored: Set<string>;
  succeeded: Set<string>;
  maxTurns: number;
  /** "stuck" = we hard-stopped an unproductive repeat loop early; "cap"
   *  (default) = we ran out of turns. Changes only the header phrasing. */
  stopped?: "cap" | "stuck";
  /** Set when the stop came from the PER-TOOL cap: which tool hit it, and whether
   *  it is a governed web read. A research turn stopped after 20 pages and an
   *  `execute_sql` hammer are different events for the user — the first one was
   *  doing exactly the right thing and just didn't find the answer, so telling it
   *  « le modèle n'a pas convergé, changez de modèle » is bad advice. */
  hammered?: { tool: string; web: boolean };
  /** The block came from a tool that was FAILING, not a model repeating itself.
   *  `distinctInputs` says which of the two: >1 ⇒ the model DID vary its calls and
   *  it's the tool that isn't answering — telling it "change model" would be
   *  accusing the wrong culprit. `error` is the tool's message, already redacted. */
  repeatedFailure?: RepeatedFailure;
}): string {
  const total = [...s.callCounts.values()].reduce((a, b) => a + b, 0);
  // The tool that repeated the SAME result the most — a stuck search/discovery loop.
  let stuck: string | undefined;
  let stuckRepeats = 0;
  for (const [tool, n] of s.repeatedResult) {
    if (n > stuckRepeats) {
      stuckRepeats = n;
      stuck = tool;
    }
  }
  // Tools the model kept malforming (bad JSON / bad args) and never got right.
  const unresolved = [...s.argErrored].filter((t) => !s.succeeded.has(t));

  // A web search that doesn't succeed isn't a failure: the path taken was the
  // right one, the answer just wasn't on the pages opened. We SAY so, and suggest
  // what actually helps (narrowing the target), not "change model".
  if (s.hammered?.web) {
    const pages = s.callCounts.get(s.hammered.tool) ?? total;
    return [
      `⚠️ Recherche interrompue après ${pages} page${pages > 1 ? "s" : ""} consultée${pages > 1 ? "s" : ""}.`,
      "Le modèle a continué à chercher sans trouver de quoi répondre — la réponse n'était sur aucune des pages ouvertes.",
      "Pistes : précisez la cible (nom exact, site officiel, ville…), demandez un point plus étroit, ou indiquez directement l'adresse à consulter.",
    ].join("\n\n");
  }

  const header =
    s.hammered
      ? `⚠️ Limite atteinte : ${s.callCounts.get(s.hammered.tool) ?? total} appels à ${toolPhrase(s.hammered.tool)} dans le même tour.`
      : s.stopped === "stuck"
        ? `⚠️ Boucle d'outils interrompue après ${total} appel${total > 1 ? "s" : ""}.`
        : `⚠️ Limite d'appels d'outils atteinte (${s.maxTurns} tours, ${total} appel${total > 1 ? "s" : ""}) sans réponse finale.`;
  const lines = [header];
  const fail = s.repeatedFailure;
  if (fail && fail.distinctInputs > 1) {
    // The case that wrongly accused the model: different INPUTS, the same failure.
    lines.push(
      `${toolPhrase(fail.tool)} a échoué ${stuckRepeats + 1} fois de suite, sur des entrées différentes. ` +
        `Le modèle a bien varié ses appels — c'est l'outil qui ne répond pas :`,
      `> ${fail.error}`,
    );
    lines.push(
      "Pistes : l'action existe (d'autres appels ont abouti), donc changer de modèle n'y ferait rien. " +
        "Vérifiez plutôt que les éléments visés existent encore et que le connecteur a les droits de les lire, " +
        "puis relancez.",
    );
    return lines.join("\n\n");
  }
  if (fail) {
    lines.push(
      `${toolPhrase(fail.tool)} a échoué ${stuckRepeats + 1} fois sur le MÊME appel :`,
      `> ${fail.error}`,
    );
  } else if (stuck && stuckRepeats >= 2) {
    lines.push(
      `${toolPhrase(stuck)} a renvoyé le même résultat ${stuckRepeats + 1} fois : le modèle relançait le même appel au lieu de changer d'approche.`,
    );
  } else if (unresolved.length) {
    lines.push(
      `Le modèle n'a pas réussi à former un appel valide pour : ${unresolved.map(toolPhrase).join(", ")}.`,
    );
  } else {
    lines.push("Le modèle a enchaîné les appels d'outils sans converger vers une réponse.");
  }
  lines.push(
    "Pistes : précisez la demande, essayez un modèle plus capable (Claude, GPT-5.x…), ou vérifiez que le connecteur expose bien l'action.",
  );
  return lines.join("\n\n");
}

/**
 * A ```document / ```code block is CONTENT the model was ASKED to produce — never
 * the assistant's own conversational framing. Its body routinely carries
 * politeness/deferral phrasing ("prendre un moment pour vous remercier", "je vais
 * examiner votre dossier") that must NOT be read as the assistant deferring an
 * action — that false positive was firing the forced-tool retry on every generated
 * email/letter (and, on providers that reject tool_choice=required, turning the
 * delivered answer red). Stripping fenced blocks is LANGUAGE-AGNOSTIC: it removes
 * the hazard in every language, whatever the deferral lexicon below covers. Also
 * drops a trailing UNCLOSED fence (a truncated/streamed block). Pinned by
 * `mcpAgentGuidance.test.ts` ("does NOT trip on a generated document body"). */
function stripGeneratedBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, " ").replace(/```[\s\S]*$/g, " ");
}

/** A final answer that DECLINES to act ("je ne peux pas…"), merely PROMISES to act
 *  without calling anything ("je vais consulter vos emails tout de suite", "let me
 *  check…"), or NARRATES the integration-suggestion feature instead of invoking it
 *  ("aucune de ces intégrations n'est connectée, laquelle utilisez-vous ?") —
 *  combined with "no tool was ever called while tools were available", a strong
 *  signal the model meant to use a tool but didn't (a classic weak-model, e.g. GLM,
 *  deferral). Kept to inability / action-deferral / connect-prose phrasings so a
 *  normal conversational reply doesn't trip it.
 *
 *  MULTILINGUAL: the model answers in the user's language, so each branch covers the
 *  major ones (FR · EN · ES · DE · IT · PT · NL). Lexical matching can't literally
 *  span every language — the robustness that DOES is `stripGeneratedBlocks` (the
 *  false positive was always in generated content) plus the fact the retry this gates
 *  is now OPPORTUNISTIC (`mcpAgent.ts`): a miss just skips a bonus retry, a
 *  false positive keeps the answer instead of failing. So this list is a
 *  best-effort recall aid, never a correctness gate.
 *
 *  ⚠️ Each branch must stay tied to an INTENT TO ACT that produced no call. Widening
 *  this to "the reply asks a question" would force a tool call on every legitimate
 *  clarification — `mcpAgentGuidance.test.ts` pins the negatives that keep it honest. */
export function looksLikeRefusal(raw: string): boolean {
  const text = stripGeneratedBlocks(raw);
  // Inability / refusal — "I can't / I'm unable / unfortunately".
  if (
    /\b(?:je ne peux pas|je ne suis pas en mesure|je n['e ]?ai pas (?:accès|la possibilité|la capacité)|il ne m['e ]?est pas possible|i (?:can'?t|cannot|am unable|am not able)|i'?m unable|no puedo|no tengo (?:acceso|la posibilidad)|no soy capaz|no me es posible|ich kann (?:das |dies |es )?nicht|ich habe keinen zugriff|ich bin nicht in der lage|non posso|non sono in grado|non ho (?:accesso|la possibilità)|não posso|não consigo|não tenho acesso|não sou capaz|ik kan (?:dat |dit |het )?niet|ik heb geen toegang)\b/i.test(
      text,
    ) ||
    /\b(?:malheureusement|unfortunately|lamentablemente|leider|purtroppo|infelizmente|helaas)\b/i.test(text)
  ) {
    return true;
  }
  // Connect-prose: it TALKS ABOUT the not-connected integrations from `suggestGuidance`
  // (or the connect cards themselves) instead of calling `suggest_integrations`. The
  // model can only know an integration is unconnected FROM that injected block, so this
  // phrasing means the guidance landed and the tool call didn't — exactly what the
  // forced retry exists to recover. A weak free model narrates the feature it was handed.
  if (
    /(?:(?:pas|non) (?:encore )?connectée?s?|(?:aucune|aucun)[^.!?\n]{0,40}(?:intégration|connecteur)|(?:quel|quelle|lequel|laquelle)[^.!?\n]{0,60}(?:utilisez[- ]vous|vous utilisez)|en un (?:clic|geste)|not (?:yet )?connected|none of (?:these|the) (?:integrations|connectors)|which (?:tool|service|integration|app)[^.!?\n]{0,40}(?:do you use|are you using)|in one click|no est[áa]s? (?:aún |todavía )?conectad[oa]s?|ninguna de (?:estas|las) integraciones|qu[ée] (?:herramienta|servicio|integraci[óo]n)[^.!?\n]{0,40}(?:usas|utilizas)|con un (?:solo )?clic|nicht verbunden|keine dieser integrationen|welches (?:tool|programm|dienst)[^.!?\n]{0,40}(?:nutzt du|verwendest du)|mit einem klick|non (?:è )?(?:connesso|collegato)|nessuna (?:di queste )?integrazione|quale (?:strumento|servizio)[^.!?\n]{0,40}usi|con un clic|n[ãa]o (?:est[áa] |est[ãa]o )?conectad[oa]s?|nenhuma dessas integra[çc][õo]es|qual (?:ferramenta|servi[çc]o)[^.!?\n]{0,40}(?:voc[êe] usa|usa)|com um clique|niet verbonden|geen van deze integraties|welke (?:tool|dienst)[^.!?\n]{0,40}gebruik je|met (?:één|een) klik)/i.test(
      text,
    )
  ) {
    return true;
  }
  // PLAN-LEAK: prose NAMING a namespaced tool instead of EMITTING the call (pinned).
  if (/\b[a-z][\w-]*__[a-z][\w-]*\b/i.test(text)) return true;
  // TEXTUAL PSEUDO-CALL: the model prints the SYNTAX of a tool call instead of
  // emitting it through the tooled channel — measured in eval on Gemma
  // (`<|tool_call>call:browser_navigate{url:…}`), DeepSeek/Qwen variants included.
  // Like the plan-leak: a forced retry generally recovers the real call.
  if (/<\|?tool[_▁]?calls?\|?>|\bcall:[a-z][\w-]*\s*\{|\[tool_?call\]|<tool_?call>/i.test(text)) return true;
  // Deferral: it promises to act (fetch/check/look…) but produced no tool call.
  return /(?:je vais (?:consulter|vérifier|regarder|chercher|récupérer|accéder|lire|examiner|aller voir|jeter un)|je (?:consulte|vérifie|regarde|récupère|recherche)|laissez[- ]moi (?:consulter|vérifier|regarder|voir)|un (?:instant|moment)|tout de suite|let me (?:check|look|see|retrieve|fetch|pull up|access|grab)|i'?ll (?:check|look|retrieve|fetch|access|get|pull up|take a look)|one moment|hold on|give me a (?:moment|sec)|d[ée]jame (?:comprobar|revisar|ver|buscar|acceder)|voy a (?:comprobar|revisar|buscar|mirar|ver|consultar)|un momento|enseguida|lass mich [^.!?\n]{0,15}(?:nachsehen|prüfen|nachschauen|schauen)|einen (?:moment|augenblick)|ich (?:schaue|prüfe|sehe)(?: kurz| mal| eben)? nach|fammi (?:controllare|verificare|vedere|cercare)|un (?:momento|attimo)|(?:controllo|verifico) subito|deixe-me (?:verificar|checar|ver|procurar|acessar)|vou (?:verificar|checar|procurar|olhar|consultar)|um (?:momento|instante)|laat me [^.!?\n]{0,15}(?:kijken|controleren|checken)|een (?:moment|ogenblik)|ik (?:kijk|controleer) even)/i.test(
    text,
  );
}

/**
 * The request NAMES a CONNECTED connector — and the turn ended without a single
 * tool call. `looksLikeRefusal` only covers refusal/deferral IN PROSE; a weak model
 * has a third, worse failure mode: it INVENTS plausible data (measured: "what are
 * intercom's users?" → a table of fabricated names/emails/phone numbers, zero calls
 * — read by the user as a redaction leak, when nothing was real). When the user
 * names the service, answering without querying it is never the right answer — same
 * opportunistic recovery as the refusal case: ONE forced read-only retry, and the
 * "model too limited" hint if it can't.
 *
 * Bounded to the connector named as a WHOLE WORD (non-alphanumeric boundaries) so an
 * ordinary conversational reply is never diverted; composite ids
 * (`google-calendar`) only match as such — a recall aid, not a correctness gate
 * (a miss costs the status quo, a false positive one read call).
 */
export function namesConnectedConnector(
  requestText: string,
  connectedIds: Iterable<string>,
): boolean {
  const text = (requestText || "").toLowerCase();
  if (!text) return false;
  for (const id of connectedIds) {
    const needle = String(id ?? "").toLowerCase();
    if (!needle) continue;
    for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + 1)) {
      const before = i === 0 ? "" : text[i - 1];
      const after = text[i + needle.length] ?? "";
      if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
    }
  }
  return false;
}
