import { appendFileSync } from "node:fs";

/**
 * E2E hook: record the EXACT payload handed to the provider transport — the
 * redacted messages streamChat()/completeWithTools() POST upstream — so a test can
 * assert no personal data ever leaves the machine on ANY path (plain streaming AND
 * the agentic tool turns). Tool schemas are reduced to their NAMES (the schemas are
 * static noise; the privacy assertion is about messages). Inert without the env var.
 */
export function e2eWireLog(options: {
  provider?: string;
  model?: string;
  messages?: unknown;
  tools?: unknown[];
}): void {
  if (!process.env.OPENMASQ_E2E_WIRE_LOG) return;
  try {
    const tools = Array.isArray(options.tools)
      ? options.tools.map((t) => {
          const o = t as { name?: string; function?: { name?: string } };
          return o.function?.name ?? o.name ?? "?";
        })
      : undefined;
    appendFileSync(
      process.env.OPENMASQ_E2E_WIRE_LOG,
      JSON.stringify({
        provider: options.provider,
        model: options.model,
        messages: options.messages,
        ...(tools ? { tools } : {}),
      }) + "\n",
    );
  } catch {
    /* best-effort: never break a send for the log */
  }
}
