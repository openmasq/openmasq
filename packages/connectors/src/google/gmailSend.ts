import { BRAND } from "@openmasq/branding";
import type { ConnectorTool, ConnectorToolCtx } from "../types";
import { stringList } from "../args";
import { googleApiErrorHint } from "./googleApiError";
import { readAttachments, type AttachmentData } from "../files";

/**
 * The Gmail SEND tool. Composes and sends mail as the user via the Gmail API
 * `messages.send`, authenticated desktop-direct (OAuth loopback + PKCE, no
 * broker). It uses ONLY the `gmail.send` scope: this TOOL cannot read the inbox,
 * list, or draft — reading rides the separate `gmail.readonly`-tagged tools of
 * `gmailRead.ts` (offered in both modes since 30/07/2026). EXPORTED and composed
 * into the merged `gmailConnector`; it is also the only tool a pre-30/07 1-clic
 * connection still offers until the user reconnects (scope not yet granted).
 */
const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

/** Base64 of a UTF-8 string (standard alphabet, padded). Pure: TextEncoder+btoa. */
function b64Utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Base64URL (no padding) — the encoding Gmail's `raw` field expects. */
function b64url(s: string): string {
  return b64Utf8(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** RFC 2047-encode a header value only when it carries non-ASCII (else pass-through). */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7F]/.test(value) ? `=?UTF-8?B?${b64Utf8(value)}?=` : value;
}

/** Normalise a recipient arg (string or string[]) to a comma-joined header value. */
// ⚠️ `stringList` (and not a local split): a model may send a JSON array
// ENCODED AS A STRING (`'["a@b.c"]'`), which the old code took for a single address,
// brackets included. One single normalization for every connector (rule 9).
function addrs(v: unknown): string | undefined {
  return stringList(v).join(", ") || undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** MIME wants base64 wrapped at 76 chars per line. */
function wrap76(b64: string): string {
  return b64.replace(/.{1,76}/g, "$&\r\n").trimEnd();
}
/** Build a `multipart/mixed` RFC 2822 message (text body + file parts). */
function buildMultipart(headerLines: string[], body: string, atts: AttachmentData[]): string {
  const boundary = `${BRAND.slug}_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  const parts = [`--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${body}`];
  for (const a of atts) {
    const name = encodeHeader(a.filename || "fichier");
    parts.push(
      `--${boundary}\r\n` +
        `Content-Type: ${a.mimeType || "application/octet-stream"}; name="${name}"\r\n` +
        `Content-Disposition: attachment; filename="${name}"\r\n` +
        `Content-Transfer-Encoding: base64\r\n\r\n` +
        wrap76(a.contentBase64),
    );
  }
  const head = [...headerLines, `Content-Type: multipart/mixed; boundary="${boundary}"`].join("\r\n");
  return `${head}\r\n\r\n${parts.join("\r\n")}\r\n--${boundary}--`;
}

/** The Gmail send tool — shared so the BYO read+send connector reuses ONE
 *  implementation (`gmailRead` imports it). `gmail.send` is sensitive-but-not-
 *  restricted (no CASA); the tool itself only sends (it never reads the inbox). */
export const sendEmail: ConnectorTool = {
  name: "send_email",
  scope: "https://www.googleapis.com/auth/gmail.send",
  description:
    "Envoyer un email au nom de l'utilisateur connecté (envoi uniquement — ne peut PAS lire la boîte). " +
    "À utiliser pour « écris/envoie un mail à … ». `to`/`cc`/`bcc` acceptent une adresse ou une liste ; " +
    "`subject` et `body` (texte brut) sont requis. Pour joindre un document de la conversation en PIÈCE JOINTE, " +
    "mets son nom dans `attachments` (le fichier original est envoyé). L'email part depuis le compte de l'utilisateur et atterrit dans « Envoyés ».",
  // NB: `to`/`cc`/`bcc` are declared as a PLAIN STRING (comma-separated for several
  // recipients), NOT a oneOf[string,array] — weak models (Gemma…) trip on `oneOf`
  // and silently DROP the field, so the send failed with "`to` requis". `addrs()`
  // below still accepts a string OR an array, so a model that sends an array works
  // too; the schema just advertises the simplest, most-fillable shape.
  inputSchema: {
    type: "object",
    required: ["to", "subject", "body"],
    properties: {
      to: {
        type: "string",
        description:
          "Adresse email du destinataire (obligatoire). Plusieurs destinataires : séparez-les par des virgules.",
      },
      subject: { type: "string", description: "Objet de l'email." },
      body: { type: "string", description: "Corps de l'email (texte brut)." },
      cc: { type: "string", description: "Cc (optionnel) — adresse(s) séparées par des virgules." },
      bcc: { type: "string", description: "Cci (optionnel) — adresse(s) séparées par des virgules." },
      attachments: {
        type: "array",
        items: { type: "string" },
        description:
          "Pour envoyer un ou plusieurs documents de la conversation en PIÈCE JOINTE (PJ), mets leur nom ici " +
          "(le fichier fourni par l'utilisateur). Le fichier ORIGINAL est joint et envoyé depuis le compte " +
          "Gmail de l'utilisateur — n'écris PAS le contenu du fichier dans le corps quand tu utilises ce champ.",
      },
    },
  },
  async run(args, ctx: ConnectorToolCtx) {
    const to = addrs(args.to);
    const subject = str(args.subject) ?? "";
    const body = typeof args.body === "string" ? args.body : "";
    if (!to) {
      return {
        content: [
          {
            type: "text",
            text:
              "Le champ `to` (adresse email du destinataire) est OBLIGATOIRE et manquant. " +
              "Renseigne l'adresse demandée par l'utilisateur dans `to`, puis rappelle l'outil.",
          },
        ],
        isError: true,
      };
    }
    if (!str(args.subject) && !body) {
      return {
        content: [{ type: "text", text: "Les champs `subject` (objet) et `body` (corps) sont obligatoires." }],
        isError: true,
      };
    }
    const cc = addrs(args.cc);
    const bcc = addrs(args.bcc);
    // Attachments are resolved by the DESKTOP (original bytes from the conversation's
    // local store) and injected as `__attachmentData` — the model only names them.
    const atts = readAttachments((args as Record<string, unknown>).__attachmentData);

    // RFC 2822 message. The whole thing is base64url-encoded for `raw`, so the
    // UTF-8 body bytes survive intact; we still declare the charset for rendering.
    // With attachments it's a `multipart/mixed`; otherwise a plain text body.
    const baseHeaders = [
      `To: ${to}`,
      cc ? `Cc: ${cc}` : null,
      bcc ? `Bcc: ${bcc}` : null,
      `Subject: ${encodeHeader(subject)}`,
      "MIME-Version: 1.0",
    ].filter((l): l is string => l !== null);
    const raw = atts.length
      ? b64url(buildMultipart(baseHeaders, body, atts))
      : b64url(`${baseHeaders.join("\r\n")}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${body}`);

    try {
      await ctx.fetchJson<{ id?: string }>(SEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
    } catch (err) {
      const hint = googleApiErrorHint(err, {
        api: "API Gmail",
        connector: "Gmail",
        scope: "l'autorisation d'ENVOI d'emails",
        fallback: "Envoi impossible",
      });
      return { content: [{ type: "text", text: hint }], isError: true };
    }
    const pj = atts.length
      ? ` — ${atts.length} pièce(s) jointe(s) : ${atts.map((a) => a.filename).join(", ")}`
      : "";
    return {
      content: [{ type: "text", text: `Email envoyé à ${to}${subject ? ` — objet : ${subject}` : ""}${pj}` }],
    };
  },
};
