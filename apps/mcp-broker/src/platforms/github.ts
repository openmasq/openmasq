import { z } from "zod";
import { config } from "../config.js";
import type { Platform } from "./types.js";

/** GitHub platform. Federates to GitHub OAuth and reads repos/issues via the REST API. */
const API = "https://api.github.com";

export const githubPlatform: Platform = {
  id: "github",
  name: "GitHub",
  desc: "Repositories & issues",
  upstream: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["repo", "read:user"],
    clientId: config.providers.github.clientId,
    clientSecret: config.providers.github.clientSecret,
  },
  registerTools(server, ctx) {
    server.registerTool(
      "list_repos",
      {
        description: "List the authenticated user's repositories, most recently updated first.",
        inputSchema: { limit: z.number().int().min(1).max(50).optional() },
      },
      async ({ limit }) => {
        const repos = await ctx.fetchJson<{ full_name: string; description?: string }[]>(
          `${API}/user/repos?sort=updated&per_page=${limit ?? 20}`,
        );
        const text = repos.map((r) => `${r.full_name}${r.description ? ` — ${r.description}` : ""}`).join("\n");
        return { content: [{ type: "text", text: text || "No repositories." }] };
      },
    );
    server.registerTool(
      "list_issues",
      {
        description: "List open issues assigned to the authenticated user.",
        inputSchema: { limit: z.number().int().min(1).max(50).optional() },
      },
      async ({ limit }) => {
        const issues = await ctx.fetchJson<{ title: string; html_url: string }[]>(
          `${API}/issues?filter=assigned&state=open&per_page=${limit ?? 20}`,
        );
        const text = issues.map((i) => `${i.title} — ${i.html_url}`).join("\n");
        return { content: [{ type: "text", text: text || "No open issues." }] };
      },
    );
  },
};
