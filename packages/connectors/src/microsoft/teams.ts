import type { Connector, ConnectorTool, ConnectorToolCtx } from "../types";
import { GRAPH, clampLimit, str, stripHtml } from "./graph";

/**
 * Microsoft Teams connector (Microsoft Graph — teams & channels). List joined teams,
 * list channels, read recent channel messages, post a message. Its scopes
 * (`Team.ReadBasic.All`, `Channel.ReadBasic.All`, `ChannelMessage.Read.All`,
 * `ChannelMessage.Send`) require ADMIN CONSENT, so this is **BYO-ONLY** — usable only
 * under the user's own registered app. Token obtained desktop-direct via Microsoft PKCE.
 */
interface Team {
  id?: string;
  displayName?: string;
}
interface Channel {
  id?: string;
  displayName?: string;
}
interface ChannelMessage {
  from?: { user?: { displayName?: string } };
  body?: { content?: string; contentType?: string };
  createdDateTime?: string;
}

const listTeams: ConnectorTool = {
  name: "list_teams",
  description: "Lister les équipes Teams dont l'utilisateur est membre. Renvoie le nom et l'id.",
  inputSchema: { type: "object", properties: {} },
  async run(_args, ctx: ConnectorToolCtx) {
    const res = await ctx.fetchJson<{ value?: Team[] }>(`${GRAPH}/me/joinedTeams`);
    const rows = (res.value ?? []).map((t) => `${t.displayName ?? "(sans nom)"} · teamId:${t.id}`);
    return { content: [{ type: "text", text: rows.join("\n") || "Aucune équipe." }] };
  },
};

const listChannels: ConnectorTool = {
  name: "list_channels",
  description: "Lister les canaux d'une équipe Teams (par teamId). Renvoie le nom et l'id.",
  inputSchema: {
    type: "object",
    required: ["teamId"],
    properties: { teamId: { type: "string", description: "L'id de l'équipe (voir list_teams)." } },
  },
  async run(args, ctx: ConnectorToolCtx) {
    const teamId = str(args.teamId);
    if (!teamId) return { content: [{ type: "text", text: "teamId requis." }], isError: true };
    const res = await ctx.fetchJson<{ value?: Channel[] }>(`${GRAPH}/teams/${teamId}/channels`);
    const rows = (res.value ?? []).map((c) => `${c.displayName ?? "(sans nom)"} · channelId:${c.id}`);
    return { content: [{ type: "text", text: rows.join("\n") || "Aucun canal." }] };
  },
};

const readChannel: ConnectorTool = {
  name: "read_channel",
  description: "Lire les messages récents d'un canal Teams (par teamId + channelId).",
  inputSchema: {
    type: "object",
    required: ["teamId", "channelId"],
    properties: {
      teamId: { type: "string", description: "L'id de l'équipe." },
      channelId: { type: "string", description: "L'id du canal (voir list_channels)." },
      limit: { type: "number", description: "Nombre de messages (défaut 15, max 40)." },
    },
  },
  async run(args, ctx: ConnectorToolCtx) {
    const teamId = str(args.teamId);
    const channelId = str(args.channelId);
    if (!teamId || !channelId) {
      return { content: [{ type: "text", text: "teamId et channelId sont requis." }], isError: true };
    }
    const limit = clampLimit(args.limit, 15, 40);
    const res = await ctx.fetchJson<{ value?: ChannelMessage[] }>(
      `${GRAPH}/teams/${teamId}/channels/${channelId}/messages?$top=${limit}`,
    );
    const rows = (res.value ?? []).map((m) => {
      const who = m.from?.user?.displayName ?? "?";
      const raw = m.body?.content ?? "";
      const text = m.body?.contentType === "html" ? stripHtml(raw) : raw;
      return `${who}: ${text || "(vide)"}`;
    });
    return { content: [{ type: "text", text: rows.join("\n") || "Aucun message." }] };
  },
};

const sendMessage: ConnectorTool = {
  name: "send_message",
  description: "Publier un message dans un canal Teams (par teamId + channelId), en votre nom.",
  inputSchema: {
    type: "object",
    required: ["teamId", "channelId", "content"],
    properties: {
      teamId: { type: "string", description: "L'id de l'équipe." },
      channelId: { type: "string", description: "L'id du canal." },
      content: { type: "string", description: "Le texte du message." },
    },
  },
  async run(args, ctx: ConnectorToolCtx) {
    const teamId = str(args.teamId);
    const channelId = str(args.channelId);
    const content = str(args.content);
    if (!teamId || !channelId || !content) {
      return { content: [{ type: "text", text: "teamId, channelId et content sont requis." }], isError: true };
    }
    await ctx.fetchJson(`${GRAPH}/teams/${teamId}/channels/${channelId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: { content } }),
    });
    return { content: [{ type: "text", text: "Message publié dans le canal." }] };
  },
};

export const microsoftTeamsConnector: Connector = {
  id: "microsoft-teams",
  name: "Microsoft Teams",
  auth: "microsoft",
  // ChannelMessage/Team/Channel scopes need ADMIN CONSENT → BYO-only (user's own app).
  byoOnly: true,
  scopes: {
    managed: [],
    byo: ["Team.ReadBasic.All", "Channel.ReadBasic.All", "ChannelMessage.Read.All", "ChannelMessage.Send"],
  },
  tools: [listTeams, listChannels, readChannel, sendMessage],
};
