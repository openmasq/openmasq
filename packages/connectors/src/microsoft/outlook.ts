import type { Connector, ConnectorTool, ConnectorToolCtx } from "../types";
import { GRAPH, addrs, clampLimit, str, stripHtml } from "./graph";
import { readAttachments, } from "../files";

/**
 * Outlook connector (Microsoft Graph — mail). Search + list recent messages and send
 * mail with the user's token obtained desktop-direct via Microsoft loopback + PKCE
 * (public client, no secret). `Mail.Read` + `Mail.Send` are delegated user scopes
 * that need NO admin consent, so 1-clic works.
 */
interface GraphMessage {
  id?: string;
  subject?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  receivedDateTime?: string;
  body?: { contentType?: string; content?: string };
}

/** Each line CARRIES the id — the target for `get_message` (without it, the model listed
 *  the headers then announced it couldn't read the content). */
function fmt(m: GraphMessage): string {
  const from = m.from?.emailAddress?.address ?? m.from?.emailAddress?.name ?? "?";
  const when = m.receivedDateTime ? ` — ${m.receivedDateTime.slice(0, 16).replace("T", " ")}` : "";
  return `${m.subject ?? "(sans objet)"} · de ${from}${when} [id: ${m.id ?? "?"}]`;
}

const searchMessages: ConnectorTool = {
  name: "search_messages",
  description:
    "Rechercher des emails Outlook par mots-clés (objet, expéditeur, contenu). Renvoie, par message, " +
    "l'expéditeur, l'objet, la date et l'[id]. Pour lire un CORPS : get_message avec cet id.",
  inputSchema: {
    type: "object",
    required: ["query"],
    properties: {
      query: { type: "string", description: "Texte à rechercher." },
      limit: { type: "number", description: "Nombre de résultats (défaut 15, max 40)." },
    },
  },
  async run(args, ctx: ConnectorToolCtx) {
    const query = str(args.query);
    if (!query) return { content: [{ type: "text", text: "query requis." }], isError: true };
    const limit = clampLimit(args.limit, 15, 40);
    const url =
      `${GRAPH}/me/messages?$search=${encodeURIComponent(`"${query}"`)}&$top=${limit}` +
      `&$select=${encodeURIComponent("id,subject,from,receivedDateTime")}`;
    const res = await ctx.fetchJson<{ value?: GraphMessage[] }>(url, {
      headers: { ConsistencyLevel: "eventual" },
    });
    const rows = (res.value ?? []).map(fmt);
    return { content: [{ type: "text", text: rows.join("\n") || "Aucun message." }] };
  },
};

const listRecent: ConnectorTool = {
  name: "list_recent",
  description:
    "Lister les emails récents de la boîte de réception Outlook (expéditeur, objet, date, [id]). " +
    "Pour lire un CORPS : get_message avec cet id.",
  inputSchema: {
    type: "object",
    properties: { limit: { type: "number", description: "Nombre de messages (défaut 15, max 40)." } },
  },
  async run(args, ctx: ConnectorToolCtx) {
    const limit = clampLimit(args.limit, 15, 40);
    const url =
      `${GRAPH}/me/mailFolders/inbox/messages?$top=${limit}` +
      `&$select=${encodeURIComponent("id,subject,from,receivedDateTime")}&$orderby=receivedDateTime desc`;
    const res = await ctx.fetchJson<{ value?: GraphMessage[] }>(url);
    const rows = (res.value ?? []).map(fmt);
    return { content: [{ type: "text", text: rows.join("\n") || "Boîte de réception vide." }] };
  },
};

// The result goes back through redaction then the generic cap (16k) — this bound
// just avoids paying for detection on a mile-long email. Mirrors Gmail's `get_message`.
const MAX_BODY_CHARS = 20_000;

const getMessage: ConnectorTool = {
  name: "get_message",
  description:
    "Lire le CONTENU d'un email Outlook (corps texte + expéditeur, objet, date) à partir de son id — " +
    "l'`[id: …]` renvoyé par search_messages / list_recent. À appeler pour résumer, classer ou " +
    "répondre à un message précis : les outils de liste ne renvoient jamais le corps.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", description: "L'id du message (renvoyé par les outils de liste)." } },
    required: ["id"],
  },
  async run(args, ctx: ConnectorToolCtx) {
    const id = str(args.id);
    if (!id) return { content: [{ type: "text", text: "id requis." }], isError: true };
    const url =
      `${GRAPH}/me/messages/${encodeURIComponent(id)}` +
      `?$select=${encodeURIComponent("id,subject,from,receivedDateTime,body")}`;
    const m = await ctx.fetchJson<GraphMessage>(url);
    const raw = m.body?.content ?? "";
    const body = (m.body?.contentType === "html" ? stripHtml(raw) : raw).trim() || "(corps vide)";
    const from = m.from?.emailAddress?.address ?? m.from?.emailAddress?.name ?? "?";
    const text =
      `De : ${from}\nObjet : ${m.subject ?? "(sans objet)"}\nDate : ${m.receivedDateTime ?? "?"}\n\n` +
      `${body.slice(0, MAX_BODY_CHARS)}${body.length > MAX_BODY_CHARS ? "\n…(tronqué)" : ""}`;
    return { content: [{ type: "text", text }] };
  },
};

// Graph `sendMail` embeds attachments INLINE in the message; the whole request must
// stay under Graph's ~4 MB message cap, so guard the summed (base64) size and fail with
// a clear FR message rather than an opaque Graph 413.
const MAX_ATTACH_B64 = 4_000_000;

const sendEmail: ConnectorTool = {
  name: "send_email",
  description:
    "Envoyer un email depuis le compte Outlook de l'utilisateur. `to` = destinataire(s) (adresse ou liste). " +
    "Pour joindre un document de la conversation en PIÈCE JOINTE, mets son nom dans `attachments` (le fichier " +
    "original est envoyé) — n'écris PAS le contenu du fichier dans le corps quand tu utilises ce champ.",
  inputSchema: {
    type: "object",
    required: ["to", "subject", "body"],
    properties: {
      to: { type: "string", description: "Destinataire(s), séparés par des virgules." },
      subject: { type: "string", description: "Objet." },
      body: { type: "string", description: "Corps du message (texte)." },
      attachments: {
        type: "array",
        items: { type: "string" },
        description:
          "Pour joindre un ou plusieurs documents de la conversation en PIÈCE JOINTE (PJ), mets leur nom ici " +
          "(le fichier fourni ou généré dans la conversation). Le fichier ORIGINAL est joint et envoyé depuis " +
          "le compte Outlook de l'utilisateur.",
      },
    },
  },
  async run(args, ctx: ConnectorToolCtx) {
    const to = addrs(args.to);
    const subject = str(args.subject) ?? "";
    const body = str(args.body);
    if (to.length === 0 || !body) {
      return { content: [{ type: "text", text: "to (destinataire) et body sont requis." }], isError: true };
    }
    // Attachments: resolved by the DESKTOP into `__attachmentData` (real bytes) AFTER the
    // write-confirmation; the model only named them. → Graph fileAttachment parts.
    const atts = readAttachments((args as Record<string, unknown>).__attachmentData);
    const totalB64 = atts.reduce((n, a) => n + a.contentBase64.length, 0);
    if (totalB64 > MAX_ATTACH_B64) {
      return {
        content: [{ type: "text", text: "Pièce(s) jointe(s) trop volumineuse(s) pour Outlook (limite ~3 Mo au total)." }],
        isError: true,
      };
    }
    const message: Record<string, unknown> = {
      subject,
      body: { contentType: "Text", content: body },
      toRecipients: to.map((address) => ({ emailAddress: { address } })),
    };
    if (atts.length) {
      message.attachments = atts.map((a) => ({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: a.filename || "fichier",
        contentType: a.mimeType || "application/octet-stream",
        contentBytes: a.contentBase64,
      }));
    }
    await ctx.fetchJson(`${GRAPH}/me/sendMail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const pj = atts.length ? ` (${atts.length} pièce${atts.length > 1 ? "s" : ""} jointe${atts.length > 1 ? "s" : ""})` : "";
    return { content: [{ type: "text", text: `Email envoyé à ${to.join(", ")}${pj}.` }] };
  },
};

export const microsoftOutlookConnector: Connector = {
  id: "microsoft-outlook",
  name: "Outlook",
  auth: "microsoft",
  // Delegated user scopes, no admin consent needed → 1-clic works.
  scopes: { managed: ["Mail.Read", "Mail.Send"], byo: ["Mail.Read", "Mail.Send"] },
  tools: [searchMessages, listRecent, getMessage, sendEmail],
};
