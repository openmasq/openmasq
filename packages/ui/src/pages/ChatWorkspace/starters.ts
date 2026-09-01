import { BRAND } from "@openmasq/branding";
/**
 * The empty-thread prompt starters, and WHICH four to show.
 *
 * ⚠️ **Read this before putting an integration starter back unconditionally.** A
 * « Workflow » starter existed here before and was removed for a precise reason: on a
 * fresh install nothing is connected, so it opened the app with a card that could only
 * fail. The answer is not to avoid integrations — a starter that drives the user's own
 * mailbox is the most convincing thing the app can show — it is to offer one only when
 * it will actually WORK.
 *
 * So the list is computed, not written: integration starters for the connectors that are
 * connected RIGHT NOW, then universal ones (which need no setup) to fill the four slots.
 * A fresh install therefore sees exactly what it sees today; connecting Gmail changes the
 * home screen into something about the user's own mail.
 */

/** What a starter needs before it can succeed. Internal: it is `Starter.need`'s type and
 *  nothing outside this module names it. */
type StarterNeed =
  /** Works on any install: no connector, no granted folder, no host capability. */
  | { kind: "none" }
  /** Needs ONE of these connector ids connected. Several, because the same job is done
   *  by a different service per user — mail is Gmail OR Outlook, files are Drive OR
   *  OneDrive OR SharePoint. The first CONNECTED one supplies the card's identity. */
  | { kind: "connector"; ids: string[] };

export interface Starter {
  /** Stable key — the eyebrow is the connector's name once one is resolved. */
  id: string;
  /** Fallback eyebrow for a universal starter (an integration one wears the service). */
  cat: string;
  prompt: string;
  need: StarterNeed;
}

/**
 * The integration starters, most convincing first. Each one is a job somebody actually
 * has, phrased as the whole job rather than a feature demo — "trie mes non-lus et dis-moi
 * lesquels attendent une réponse" is a morning; "envoie un email" is a button.
 *
 * They are ordered: the picker takes the first ones whose service is connected, so this
 * order is the editorial call about what impresses most.
 */
export const INTEGRATION_STARTERS: Starter[] = [
  {
    id: "mail-triage",
    cat: "Boîte mail",
    prompt:
      "Trie mes e-mails non lus de la semaine : lesquels attendent vraiment une réponse de moi, et lesquels peuvent attendre ?",
    need: { kind: "connector", ids: ["gmail", "microsoft-outlook"] },
  },
  {
    id: "files-find",
    cat: "Mes dossiers",
    prompt:
      "Retrouve dans mes dossiers le dernier devis que j'ai reçu, et sors-en le montant et les dates clés.",
    need: {
      kind: "connector",
      ids: ["google-drive", "microsoft-onedrive", "microsoft-sharepoint", "filesystem"],
    },
  },
  {
    id: "day-brief",
    cat: "Agenda",
    prompt:
      "Prépare ma journée de demain : mes rendez-vous, avec qui, et ce que je dois avoir lu avant chacun.",
    need: { kind: "connector", ids: ["google-calendar", "microsoft-outlook"] },
  },
  {
    id: "chat-catchup",
    cat: "Messages",
    prompt:
      "Résume ce que j'ai raté cette semaine dans mes canaux, et liste ce qui attend une réponse de ma part.",
    need: { kind: "connector", ids: ["slack", "microsoft-teams"] },
  },
  {
    id: "pr-review",
    cat: "Code",
    prompt: "Liste les pull requests qui attendent ma revue, et résume ce que chacune change.",
    need: { kind: "connector", ids: ["github"] },
  },
];

/** The starters that work on ANY install — the floor, and what a fresh one sees. */
export const UNIVERSAL_STARTERS: Starter[] = [
  {
    id: "write",
    cat: "Rédaction",
    prompt: `Rédige un email de remerciement à julien@${BRAND.domain}.`,
    need: { kind: "none" },
  },
  {
    id: "search",
    cat: "Recherche",
    prompt: "Quelle actualité en France aujourd'hui ?",
    need: { kind: "none" },
  },
  {
    // Teaches the MÉMOIRE's conversational gesture — an explicit « retiens que… » needs
    // no opt-in, so this one cannot fail either. The sentence is a DEMONSTRATOR, not a
    // memo: named people + a named company (redaction lights up before the user's
    // eyes BEFORE it goes out to the model) AND several entity-linked facts (CARDS get
    // born, the "N facts noted" caption clicks through to the Mémoire page's graph).
    // The old version — "I prefer short replies" alone — produced only one profile
    // line: nothing to see, nothing to click.
    id: "memory",
    cat: "Mémoire",
    prompt:
      "Retiens que sur le projet Horizon, ma cliente Camille Salvi (Atelier Lucane) valide les maquettes et que Marc Wulff gère la facturation.",
    need: { kind: "none" },
  },
  {
    id: "analyse",
    cat: "Analyse",
    prompt: "Trace un graphique des 5 ETF éligibles au PEA les plus performants de l'année.",
    need: { kind: "none" },
  },
];

/** How many cards each ROW shows. */
export const STARTER_COUNT = 4;

export interface PickedStarter extends Starter {
  /** The connector this card speaks for — the card wears its real logo and name.
   *  `undefined` for a universal starter. */
  connectorId?: string;
  /** The service is connected, so the card SENDS its prompt. False ⇒ the card offers to
   *  connect instead: it opens the connector modal and promises nothing it can't do. */
  connected?: boolean;
}

export interface PickedStarters {
  /** Works on any install, always four. */
  universal: PickedStarter[];
  /** One per service, connected ones FIRST — the rest offer to connect. */
  integrations: PickedStarter[];
}

/**
 * The two rows the home screen shows.
 *
 * ⚠️ **An unconnected integration card must not carry a PROMPT.** That was the original
 * bug (a starter that could only fail on a fresh install), and it is why the split exists
 * rather than one merged list: a card whose service is missing offers to CONNECT it —
 * `connected:false`, opening the connector modal — instead of asking a question nothing
 * can answer. Same row, same logo, different promise.
 *
 * ONE card per service. Outlook answers mail AND calendar; without this a user whose only
 * connector is Outlook gets two cards wearing one logo, which reads as a bug and spends
 * half the row on one service.
 *
 * `memoryOpen` (default: true) removes the « Retiens que… » starter when access to Memory
 * is closed — it is a TEACHING starter whose whole ending is the clickable caption leading
 * to the graph: without that screen it teaches a gesture visible nowhere. Injected so this
 * module stays pure (`starters.test.ts` has no global state to reset), and the row stays
 * FULL — there is exactly one spare universal starter.
 */
export function pickStarters(
  connectedIds: readonly string[],
  opts?: { memoryOpen?: boolean },
): PickedStarters {
  const connected = new Set(connectedIds);
  const spent = new Set<string>();
  const take = (want: boolean): PickedStarter[] => {
    const out: PickedStarter[] = [];
    for (const s of INTEGRATION_STARTERS) {
      if (s.need.kind !== "connector") continue;
      const id = s.need.ids.find((i) => connected.has(i) === want && !spent.has(i));
      if (!id) continue;
      spent.add(id);
      out.push({ ...s, connectorId: id, connected: want });
    }
    return out;
  };
  // Connected first — they are the reason to look — then the offers, up to the row's size.
  const integrations = [...take(true), ...take(false)].slice(0, STARTER_COUNT);
  const universal = UNIVERSAL_STARTERS.filter(
    (s) => s.id !== "memory" || opts?.memoryOpen !== false,
  ).slice(0, STARTER_COUNT);
  return { universal, integrations };
}
