import type { Connector, ConnectorTool, ConnectorToolCtx } from "./types";

/**
 * Slack connector — channels, threads, users, search + posting via the Slack Web
 * API with the USER token. `auth:"slack"` routes the login through the auth-only
 * relay (`apps/auth`; Slack can't PKCE + needs an HTTPS redirect), but tool calls
 * run IN-PROCESS on the desktop with the user token — the Slack DATA never touches
 * the app's servers. Slack has no CASA, so the app's own Slack app works.
 *
 * NOTE Slack returns HTTP 200 even on API errors, with `{ok:false, error}` — every
 * tool checks `ok` and surfaces `error`. Output is redacted downstream.
 *
 * Scopes are USER scopes (sent as `user_scope`, token nested under `authed_user`):
 * reads use `channels/groups:read+history` + `users:read`; `search_messages` needs
 * `search:read` and `send_message` needs `chat:write` — both TAGGED on the tool so
 * the desktop only lists them when the scope was granted (see `run.ts`).
 */
const API = "https://slack.com/api";

function clampLimit(v: unknown, def: number, max: number): number {
  const n = typeof v === "number" ? Math.floor(v) : def;
  return Math.max(1, Math.min(max, n));
}
function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

interface SlackResp {
  ok?: boolean;
  error?: string;
}

const listChannels: ConnectorTool = {
  name: "list_channels",
  description: "Lister les canaux Slack (publics et privés) accessibles — nom et id.",
  inputSchema: {
    type: "object",
    properties: { limit: { type: "number", description: "Nombre de canaux (défaut 50, max 200)." } },
  },
  async run(args, ctx: ConnectorToolCtx) {
    const limit = clampLimit(args.limit, 50, 200);
    const data = await ctx.fetchJson<
      SlackResp & { channels?: { id: string; name: string; is_private?: boolean }[] }
    >(`${API}/conversations.list?types=public_channel,private_channel&limit=${limit}`);
    if (!data.ok) return { content: [{ type: "text", text: `Erreur Slack : ${data.error ?? "inconnue"}` }], isError: true };
    const rows = (data.channels ?? []).map(
      (c) => `#${c.name}${c.is_private ? " (privé)" : ""} · id:${c.id}`,
    );
    return { content: [{ type: "text", text: rows.join("\n") || "Aucun canal." }] };
  },
};

const readChannel: ConnectorTool = {
  name: "read_channel",
  description: "Lire les messages récents d'un canal Slack par son id (voir list_channels).",
  inputSchema: {
    type: "object",
    properties: {
      channel: { type: "string", description: "L'id du canal (ex. C0123ABCD)." },
      limit: { type: "number", description: "Nombre de messages (défaut 20, max 100)." },
    },
    required: ["channel"],
  },
  async run(args, ctx: ConnectorToolCtx) {
    const channel = str(args.channel);
    if (!channel) return { content: [{ type: "text", text: "channel requis." }], isError: true };
    const limit = clampLimit(args.limit, 20, 100);
    const data = await ctx.fetchJson<
      SlackResp & { messages?: { user?: string; text?: string; ts?: string }[] }
    >(`${API}/conversations.history?channel=${encodeURIComponent(channel)}&limit=${limit}`);
    if (!data.ok) return { content: [{ type: "text", text: `Erreur Slack : ${data.error ?? "inconnue"}` }], isError: true };
    // Newest-first from Slack → show oldest-first for readability. A threaded root
    // carries `thread_ts` — expose it so read_thread can drill in.
    const rows = (data.messages ?? [])
      .slice()
      .reverse()
      .map((m) => `${m.user ?? "?"}: ${m.text ?? ""}${m.ts ? ` · ts:${m.ts}` : ""}`);
    return { content: [{ type: "text", text: rows.join("\n") || "Aucun message." }] };
  },
};

const readThread: ConnectorTool = {
  name: "read_thread",
  description: "Lire les réponses d'un fil (thread) Slack — l'id du canal + le ts du message parent.",
  inputSchema: {
    type: "object",
    properties: {
      channel: { type: "string", description: "L'id du canal (ex. C0123ABCD)." },
      thread_ts: { type: "string", description: "Le ts du message parent du fil (voir read_channel)." },
      limit: { type: "number", description: "Nombre de réponses (défaut 30, max 100)." },
    },
    required: ["channel", "thread_ts"],
  },
  async run(args, ctx: ConnectorToolCtx) {
    const channel = str(args.channel);
    const ts = str(args.thread_ts);
    if (!channel || !ts) return { content: [{ type: "text", text: "channel et thread_ts requis." }], isError: true };
    const limit = clampLimit(args.limit, 30, 100);
    const data = await ctx.fetchJson<SlackResp & { messages?: { user?: string; text?: string; ts?: string }[] }>(
      `${API}/conversations.replies?channel=${encodeURIComponent(channel)}&ts=${encodeURIComponent(ts)}&limit=${limit}`,
    );
    if (!data.ok) return { content: [{ type: "text", text: `Erreur Slack : ${data.error ?? "inconnue"}` }], isError: true };
    const rows = (data.messages ?? []).map((m) => `${m.user ?? "?"}: ${m.text ?? ""}`);
    return { content: [{ type: "text", text: rows.join("\n") || "Aucune réponse." }] };
  },
};

const listUsers: ConnectorTool = {
  name: "list_users",
  description: "Lister les membres de l'espace Slack — id, identifiant et nom réel (pour résoudre les ids des messages).",
  inputSchema: {
    type: "object",
    properties: { limit: { type: "number", description: "Nombre de membres (défaut 100, max 200)." } },
  },
  async run(args, ctx: ConnectorToolCtx) {
    const limit = clampLimit(args.limit, 100, 200);
    const data = await ctx.fetchJson<
      SlackResp & { members?: { id: string; name?: string; deleted?: boolean; is_bot?: boolean; real_name?: string }[] }
    >(`${API}/users.list?limit=${limit}`);
    if (!data.ok) return { content: [{ type: "text", text: `Erreur Slack : ${data.error ?? "inconnue"}` }], isError: true };
    const rows = (data.members ?? [])
      .filter((u) => !u.deleted)
      .map((u) => `id:${u.id} · @${u.name ?? "?"}${u.real_name ? ` (${u.real_name})` : ""}${u.is_bot ? " · bot" : ""}`);
    return { content: [{ type: "text", text: rows.join("\n") || "Aucun membre." }] };
  },
};

const getUser: ConnectorTool = {
  name: "get_user",
  description: "Détails d'un membre Slack par son id (celui affiché dans les messages).",
  inputSchema: {
    type: "object",
    properties: { user: { type: "string", description: "L'id du membre (ex. U0123ABCD)." } },
    required: ["user"],
  },
  async run(args, ctx: ConnectorToolCtx) {
    const user = str(args.user);
    if (!user) return { content: [{ type: "text", text: "user requis." }], isError: true };
    const data = await ctx.fetchJson<
      SlackResp & { user?: { id: string; name?: string; real_name?: string; profile?: { email?: string; title?: string } } }
    >(`${API}/users.info?user=${encodeURIComponent(user)}`);
    if (!data.ok || !data.user) return { content: [{ type: "text", text: `Erreur Slack : ${data.error ?? "inconnue"}` }], isError: true };
    const u = data.user;
    const parts = [`id:${u.id}`, `@${u.name ?? "?"}`];
    if (u.real_name) parts.push(u.real_name);
    if (u.profile?.title) parts.push(u.profile.title);
    if (u.profile?.email) parts.push(u.profile.email);
    return { content: [{ type: "text", text: parts.join(" · ") }] };
  },
};

const searchMessages: ConnectorTool = {
  name: "search_messages",
  description: "Rechercher des messages dans l'espace Slack par mots-clés (opérateurs Slack: in:#canal, from:@membre…).",
  scope: "search:read",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "La requête de recherche." },
      limit: { type: "number", description: "Nombre de résultats (défaut 20, max 50)." },
    },
    required: ["query"],
  },
  async run(args, ctx: ConnectorToolCtx) {
    const query = str(args.query);
    if (!query) return { content: [{ type: "text", text: "query requis." }], isError: true };
    const count = clampLimit(args.limit, 20, 50);
    const data = await ctx.fetchJson<
      SlackResp & {
        messages?: { matches?: { channel?: { name?: string }; username?: string; user?: string; text?: string; ts?: string }[] };
      }
    >(`${API}/search.messages?query=${encodeURIComponent(query)}&count=${count}`);
    if (!data.ok) return { content: [{ type: "text", text: `Erreur Slack : ${data.error ?? "inconnue"}` }], isError: true };
    const rows = (data.messages?.matches ?? []).map((m) => {
      const where = m.channel?.name ? `#${m.channel.name} ` : "";
      const who = m.username ?? m.user ?? "?";
      return `${where}${who}: ${m.text ?? ""}${m.ts ? ` · ts:${m.ts}` : ""}`;
    });
    return { content: [{ type: "text", text: rows.join("\n") || "Aucun résultat." }] };
  },
};

const sendMessage: ConnectorTool = {
  name: "send_message",
  description: "Publier un message dans un canal Slack, EN VOTRE NOM. channel = l'id du canal (voir list_channels).",
  scope: "chat:write",
  inputSchema: {
    type: "object",
    properties: {
      channel: { type: "string", description: "L'id du canal (ex. C0123ABCD)." },
      text: { type: "string", description: "Le texte du message." },
      thread_ts: { type: "string", description: "Optionnel : le ts d'un message pour répondre dans son fil." },
    },
    required: ["channel", "text"],
  },
  async run(args, ctx: ConnectorToolCtx) {
    const channel = str(args.channel);
    const text = str(args.text);
    if (!channel || !text) return { content: [{ type: "text", text: "channel et text requis." }], isError: true };
    const thread_ts = str(args.thread_ts);
    const data = await ctx.fetchJson<SlackResp & { ts?: string; channel?: string }>(`${API}/chat.postMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ channel, text, ...(thread_ts ? { thread_ts } : {}) }),
    });
    if (!data.ok) return { content: [{ type: "text", text: `Erreur Slack : ${data.error ?? "inconnue"}` }], isError: true };
    return { content: [{ type: "text", text: `Message publié dans ${data.channel ?? channel}${data.ts ? ` · ts:${data.ts}` : ""}.` }] };
  },
};

export const slackConnector: Connector = {
  id: "slack",
  name: "Slack",
  auth: "slack",
  // USER scopes (sent as `user_scope`; token nests under `authed_user`). Same in
  // both modes — Slack has no CASA. BYO is not offered (1-clic only): the exchange
  // needs the app's Slack secret, held by the auth relay; see the connector CLAUDE.md.
  // `search:read` powers search_messages; `chat:write` powers send_message (a WRITE,
  // gated by the desktop write-confirmation dialog). Adding these scopes requires
  // enabling them on the Slack app AND a reconnect (re-consent) to mint a token.
  scopes: {
    managed: ["channels:read", "channels:history", "groups:read", "groups:history", "users:read", "search:read", "chat:write"],
    byo: ["channels:read", "channels:history", "groups:read", "groups:history", "users:read", "search:read", "chat:write"],
  },
  tools: [listChannels, readChannel, readThread, listUsers, getUser, searchMessages, sendMessage],
};
