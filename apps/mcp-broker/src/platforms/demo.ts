import { z } from "zod";
import type { Platform } from "./types.js";

/**
 * Credential-free demo platform. `fake: true` makes /authorize auto-consent and
 * mint synthetic tokens, so the full DCR → authorize → token → MCP flow is
 * exercisable with no provider setup. Tools return canned data — this is what the
 * `list_recent_senders` example question resolves against in tests.
 */
const SENDERS = [
  { name: "Alice Morvan", email: "alice.morvan@example.com", subject: "Re: Q3 planning", date: "2026-06-25" },
  { name: "Bob N'Dranoh", email: "bob.ndranoh@example.com", subject: "Invoice #4821", date: "2026-06-24" },
  { name: "Carla Salvi", email: "carla.salvi@example.com", subject: "Lunch Thursday?", date: "2026-06-24" },
  { name: "David Kwan", email: "david.kwan@example.com", subject: "PR review", date: "2026-06-23" },
  { name: "Émile Ravinal", email: "emile.ravinal@example.com", subject: "Contract draft", date: "2026-06-22" },
];

export const demoPlatform: Platform = {
  id: "demo",
  name: "Demo",
  desc: "Credential-free sandbox (canned email data)",
  fake: true,
  registerTools(server) {
    server.registerTool(
      "list_recent_senders",
      {
        description: "List the people who most recently sent an email, newest first.",
        inputSchema: { limit: z.number().int().min(1).max(50).optional() },
      },
      async ({ limit }) => {
        const rows = SENDERS.slice(0, limit ?? 5);
        const text = rows
          .map((s, i) => `${i + 1}. ${s.name} <${s.email}> — "${s.subject}" (${s.date})`)
          .join("\n");
        return { content: [{ type: "text", text }] };
      },
    );
    server.registerTool(
      "echo",
      { description: "Echo a message back (connectivity check).", inputSchema: { message: z.string() } },
      async ({ message }) => ({ content: [{ type: "text", text: `Echo: ${message}` }] }),
    );
  },
};
