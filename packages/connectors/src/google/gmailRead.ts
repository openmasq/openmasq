import type { Connector, ConnectorTool, ConnectorToolCtx } from "../types";
import { sendEmail } from "./gmailSend";
import { googleApiErrorHint } from "./googleApiError";

/**
 * The single merged **Gmail** connector (`gmailConnector`, id `gmail`): search +
 * inbox listing (headers WITH the message id), READING a message
 * (`get_message` — the text body) and sending (`send_email`, reused from `gmailSend`).
 * Since 30/07/2026 the 1-clic (managed) mode requests `gmail.readonly` + `gmail.send`
 * just like byo — all four tools are offered in both modes; `run.ts` always filters
 * by GRANTED scope (an earlier connection stays send-only until
 * reconnection). Tool output flows through the renderer's redaction like any other
 * connector — a mail body full of PII leaves redacted to the model.
 */
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

interface GmailMessage {
  id?: string;
  payload?: ({ headers?: { name: string; value: string }[] } & GmailPart) | undefined;
}

function header(msg: GmailMessage, name: string): string {
  return (
    msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ""
  );
}

function clampLimit(v: unknown, def: number, max: number): number {
  const n = typeof v === "number" ? Math.floor(v) : def;
  return Math.max(1, Math.min(max, n));
}

/** Turn an upstream failure into an actionable message. The adapter surfaces the
 *  Google reason CODE, so we can name the EXACT cause (API disabled vs read scope
 *  not granted vs bad token) — not a vague "reconnect" that loops.
 *
 *  ⚠️ Declared as the connector's `errorHint` and NOT called per tool: a tool that
 *  caught the failure itself swallowed the provider's explanation with it, so the
 *  local journal lost the one field that says WHAT went wrong. Let it throw. */
function readError(err: unknown): string {
  return googleApiErrorHint(err, {
    api: "API Gmail",
    connector: "Gmail",
    scope: "l'autorisation de LECTURE de vos emails",
    fallback: "Lecture Gmail impossible",
  });
}

/** Fetch the metadata headers (From/Subject/Date) for a set of message ids. One
 *  failing message is SKIPPED (allSettled) rather than sinking the whole result.
 *  Each line CARRIES the id — without it, `get_message` has no target and the model
 *  would announce "the connector doesn't give me the content" (degraded email review). */
async function summarize(ctx: ConnectorToolCtx, ids: string[]): Promise<string> {
  const settled = await Promise.allSettled(
    ids.map((id) =>
      ctx.fetchJson<GmailMessage>(
        `${API}/messages/${id}?format=metadata` +
          `&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      ),
    ),
  );
  const rows = settled
    .filter((r): r is PromiseFulfilledResult<GmailMessage> => r.status === "fulfilled")
    .map((r, i) => {
      const subject = header(r.value, "Subject") || "(sans objet)";
      const id = r.value.id ?? ids[i];
      return `${header(r.value, "From")} — « ${subject} » (${header(r.value, "Date")}) [id: ${id}]`;
    });
  return rows.join("\n");
}

/** The TEXT of a message: recursive walk of MIME parts, `text/plain` first,
 *  fallback to roughly-stripped `text/html`. Base64url → UTF-8. */
function bodyText(part: GmailPart | undefined): string {
  if (!part) return "";
  const decode = (data?: string): string => {
    if (!data) return "";
    try {
      const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
      const bin = atob(b64);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return "";
    }
  };
  const walk = (p: GmailPart, want: string): string => {
    if (p.mimeType?.startsWith(want) && p.body?.data) return decode(p.body.data);
    for (const child of p.parts ?? []) {
      const hit = walk(child, want);
      if (hit) return hit;
    }
    return "";
  };
  const plain = walk(part, "text/plain");
  if (plain) return plain;
  const html = walk(part, "text/html");
  return html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
}

// The result goes back through redaction then the generic tool-result cap
// (16k) — this bound here just avoids paying detection cost on a river-length email.
const MAX_BODY_CHARS = 20_000;

const getMessage: ConnectorTool = {
  name: "get_message",
  scope: "https://www.googleapis.com/auth/gmail.readonly",
  description:
    "Lire le CONTENU d'un email Gmail (corps texte + expéditeur, objet, date) à partir de son id — " +
    "l'`[id: …]` renvoyé par search_messages / list_recent. À appeler pour résumer, classer ou " +
    "répondre à un message précis : les outils de liste ne renvoient jamais le corps.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", description: "L'id du message (renvoyé par les outils de liste)." } },
    required: ["id"],
  },
  async run(args, ctx) {
    const id = typeof args.id === "string" ? args.id.trim() : "";
    if (!id) return { content: [{ type: "text", text: "id requis." }], isError: true };
    const msg = await ctx.fetchJson<GmailMessage>(`${API}/messages/${encodeURIComponent(id)}?format=full`);
    const body = bodyText(msg.payload) || "(corps vide ou illisible)";
    const text =
      `De : ${header(msg, "From")}\nObjet : ${header(msg, "Subject") || "(sans objet)"}\n` +
      `Date : ${header(msg, "Date")}\n\n${body.slice(0, MAX_BODY_CHARS)}${body.length > MAX_BODY_CHARS ? "\n…(tronqué)" : ""}`;
    return { content: [{ type: "text", text }] };
  },
};

const searchMessages: ConnectorTool = {
  name: "search_messages",
  scope: "https://www.googleapis.com/auth/gmail.readonly",
  description:
    "Rechercher dans la messagerie Gmail de l'utilisateur avec une requête au format recherche Gmail " +
    "(ex. 'from:alice', 'is:unread', 'newer_than:7d', 'subject:facture', 'has:attachment'). " +
    "À utiliser dès que la question porte sur des emails précis (d'un expéditeur, non lus, sur un sujet…). " +
    "Renvoie, par message, l'expéditeur, l'objet, la date et l'[id]. Pour lire un CORPS : get_message avec cet id.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Requête au format recherche Gmail (voir la barre de recherche Gmail).",
      },
      limit: { type: "number", description: "Nombre de résultats (défaut 10, max 25)." },
    },
    required: ["query"],
  },
  async run(args, ctx) {
    const query = typeof args.query === "string" ? args.query : "";
    const limit = clampLimit(args.limit, 10, 25);
    const list = await ctx.fetchJson<{ messages?: { id: string }[] }>(
      `${API}/messages?q=${encodeURIComponent(query)}&maxResults=${limit}`,
    );
    const ids = (list.messages ?? []).map((m) => m.id);
    if (ids.length === 0) return { content: [{ type: "text", text: "Aucun message correspondant." }] };
    return { content: [{ type: "text", text: await summarize(ctx, ids) }] };
  },
};

const listRecent: ConnectorTool = {
  name: "list_recent",
  scope: "https://www.googleapis.com/auth/gmail.readonly",
  description:
    "Lister les emails LES PLUS RÉCENTS de la boîte de réception (INBOX). " +
    "C'est l'outil à appeler pour « quels sont mes derniers emails ? », « mes emails récents », " +
    "« qu'est-ce que j'ai reçu ? » — il ne prend AUCUN paramètre obligatoire (juste `limit`, optionnel). " +
    "Renvoie, par message, l'expéditeur, l'objet, la date et l'[id]. Pour lire un CORPS : get_message avec cet id.",
  inputSchema: {
    type: "object",
    properties: { limit: { type: "number", description: "Nombre d'emails (défaut 10, max 25)." } },
  },
  async run(args, ctx) {
    const limit = clampLimit(args.limit, 10, 25);
    const list = await ctx.fetchJson<{ messages?: { id: string }[] }>(
      `${API}/messages?maxResults=${limit}&labelIds=INBOX`,
    );
    const ids = (list.messages ?? []).map((m) => m.id);
    if (ids.length === 0) return { content: [{ type: "text", text: "Boîte de réception vide." }] };
    return { content: [{ type: "text", text: await summarize(ctx, ids) }] };
  },
};

export const gmailConnector: Connector = {
  id: "gmail",
  name: "Gmail",
  auth: "pkce",
  // 30/07/2026: 1-clic (managed) now ALSO requests the RESTRICTED scope
  // `gmail.readonly` — 1-clic capabilities ≡ byo (CASA is an ops prerequisite, not a
  // code gate). `run.ts` always filters by GRANTED scope: an earlier 1-clic
  // connection only offers `send_email` until it is reconnected.
  scopes: {
    managed: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
    ],
    byo: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
    ],
  },
  tools: [searchMessages, listRecent, getMessage, sendEmail],
  // The same hint the read tools already apply by hand — declared here so it also
  // covers `send_email` and anything added later (see `Connector.errorHint`).
  errorHint: readError,
};
