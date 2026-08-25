import { z } from "zod";
import { config } from "../config.js";
import type { Platform } from "./types.js";

/**
 * Gmail platform. Federates to Google OAuth (offline access for a refresh token)
 * and exposes read-only inbox tools backed by the Gmail REST API. The model only
 * ever sees what the tool returns; the user's Google token stays in the broker.
 */
interface GmailMessage {
  payload?: { headers?: { name: string; value: string }[] };
}

function header(msg: GmailMessage, name: string): string {
  return msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export const gmailPlatform: Platform = {
  id: "gmail",
  name: "Gmail",
  desc: "Read & search your inbox",
  upstream: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    clientId: config.providers.gmail.clientId,
    clientSecret: config.providers.gmail.clientSecret,
    // offline + consent so Google returns a refresh_token.
    authorizeParams: { access_type: "offline", prompt: "consent" },
  },
  registerTools(server, ctx) {
    server.registerTool(
      "search_messages",
      {
        description: "Search Gmail messages with a Gmail query (e.g. 'from:alice newer_than:7d').",
        inputSchema: { query: z.string(), limit: z.number().int().min(1).max(25).optional() },
      },
      async ({ query, limit }) => {
        const list = await ctx.fetchJson<{ messages?: { id: string }[] }>(
          `${API}/messages?q=${encodeURIComponent(query)}&maxResults=${limit ?? 10}`,
        );
        const ids = (list.messages ?? []).map((m) => m.id);
        const rows = await Promise.all(
          ids.map(async (id) => {
            const m = await ctx.fetchJson<GmailMessage>(
              `${API}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
            );
            return `${header(m, "From")} — "${header(m, "Subject")}" (${header(m, "Date")})`;
          }),
        );
        return { content: [{ type: "text", text: rows.join("\n") || "No messages." }] };
      },
    );
    server.registerTool(
      "list_recent_senders",
      {
        description: "List the people who most recently sent you an email, newest first.",
        inputSchema: { limit: z.number().int().min(1).max(25).optional() },
      },
      async ({ limit }) => {
        const list = await ctx.fetchJson<{ messages?: { id: string }[] }>(
          `${API}/messages?maxResults=${limit ?? 5}&labelIds=INBOX`,
        );
        const rows = await Promise.all(
          (list.messages ?? []).map(async (m) => {
            const full = await ctx.fetchJson<GmailMessage>(
              `${API}/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Date`,
            );
            return `${header(full, "From")} (${header(full, "Date")})`;
          }),
        );
        return { content: [{ type: "text", text: rows.join("\n") || "Inbox empty." }] };
      },
    );
  },
};
