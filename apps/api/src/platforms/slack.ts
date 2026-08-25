import { z } from "zod";
import { config } from "../config.js";
import type { Platform } from "./types.js";

/**
 * Slack platform. Federates to Slack OAuth v2 and exposes read tools over the
 * Slack Web API. Slack returns `{ ok: false, error }` with HTTP 200, so tools
 * check `ok` and surface a normalised message.
 */
const API = "https://slack.com/api";

async function slackCall<T>(
  ctx: { fetchJson: <R>(u: string, i?: RequestInit) => Promise<R> },
  method: string,
): Promise<T> {
  const res = await ctx.fetchJson<{ ok: boolean; error?: string } & T>(`${API}/${method}`);
  if (!res.ok) throw new Error(`Slack: ${res.error ?? "request failed"}`);
  return res;
}

export const slackPlatform: Platform = {
  id: "slack",
  name: "Slack",
  desc: "Channels & messages",
  upstream: {
    authorizeUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    // user-scoped reads
    scopes: ["channels:read", "search:read"],
    clientId: config.providers.slack.clientId,
    clientSecret: config.providers.slack.clientSecret,
    // Slack v2 returns the user token under authed_user, not the top-level bot token.
    parseToken: (raw) => {
      const authed = raw.authed_user as { access_token?: string } | undefined;
      return { accessToken: authed?.access_token ?? String(raw.access_token ?? "") };
    },
  },
  registerTools(server, ctx) {
    server.registerTool(
      "list_channels",
      {
        description: "List public Slack channels in the workspace.",
        inputSchema: { limit: z.number().int().min(1).max(100).optional() },
      },
      async ({ limit }) => {
        const res = await slackCall<{ channels?: { name: string; id: string }[] }>(
          ctx,
          `conversations.list?limit=${limit ?? 50}&types=public_channel`,
        );
        const text = (res.channels ?? []).map((c) => `#${c.name} (${c.id})`).join("\n");
        return { content: [{ type: "text", text: text || "No channels." }] };
      },
    );
    server.registerTool(
      "search_messages",
      { description: "Search Slack messages.", inputSchema: { query: z.string() } },
      async ({ query }) => {
        const res = await slackCall<{ messages?: { matches?: { text: string }[] } }>(
          ctx,
          `search.messages?query=${encodeURIComponent(query)}`,
        );
        const text = (res.messages?.matches ?? []).map((m) => m.text).join("\n---\n");
        return { content: [{ type: "text", text: text || "No matches." }] };
      },
    );
  },
};
