/**
 * Shared type vocabulary for the redacting MCP client. Pure declarations only —
 * no runtime, no SDK — so the core and every consumer can depend on it freely.
 *
 * The model (Anthropic / GPT / Mistral) only ever sees **placeholders**, so the
 * arguments it produces for a tool call carry placeholders; we restore them just
 * before the real MCP server runs, and re-redact the server's reply before it
 * goes back to the model. See {@link McpConnection} and the redacting client.
 */

import type { Vault } from "@openmasq/redact";

/** placeholder -> original value. Re-exported from `@openmasq/redact`. */
export type { Vault } from "@openmasq/redact";

/** A JSON value (tool arguments and results are plain JSON). */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

/** A tool exposed by an MCP server, in a provider-neutral shape. */
/** MCP behaviour hints a server may declare on a tool (all optional; absent when
 *  the server doesn't set them). The authoritative, drift-proof read/write signal —
 *  `readOnlyHint:false` (or `destructiveHint:true`) means the tool MUTATES. */
export interface McpToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface McpTool {
  /** Name exposed to the model. Namespaced as `${serverId}__${tool}` by default. */
  name: string;
  description?: string;
  /** JSON Schema for the arguments, passed straight through to the provider. */
  inputSchema: JsonObject;
  /** Which connection this tool is routed to. */
  serverId: string;
  /** Server-declared behaviour hints (read-only / destructive / …), when present. */
  annotations?: McpToolAnnotations;
}

/** A tool invocation, as decoded from a provider's tool-call output. */
export interface McpToolCall {
  /** Provider tool-call id, echoed back in the result (OpenAI/Anthropic need it). */
  id?: string;
  /** The exposed tool name (matches {@link McpTool.name}). */
  name: string;
  /** Arguments as the model produced them (may contain placeholders). */
  arguments: JsonObject;
}

/** One piece of an MCP tool result. Only `text` parts are ever redacted. */
export type McpContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: string; [key: string]: JsonValue };

/** The result of running a tool on the real MCP server. */
export interface McpToolResult {
  content: McpContent[];
  isError?: boolean;
  /**
   * ⚠️ **DIAGNOSIS ONLY — this never reaches the model.** The provider's own
   * explanation of a failure ("Missing required parameter: timeMin"), which the safe
   * normalised message deliberately drops. Only `content` is handed to the model, so a
   * hostile server cannot use this field to inject instructions; its one consumer is
   * the local encrypted debug journal, whose at-rest class already covers real values.
   *
   * A failure with no explanation is a failure nobody can act on: the app guesses a
   * cause, the model guesses another, and the user gets two contradictory diagnoses.
   */
  detail?: string;
}

/**
 * A live connection to one MCP server. The redacting client speaks only this
 * interface, so the SDK-backed transport (stdio / HTTP) is swappable and the
 * core stays unit-testable with an in-memory fake.
 */
export interface McpConnection {
  /** Stable id used to namespace tool names and route calls. */
  readonly id: string;
  listTools(): Promise<McpTool[]>;
  callTool(call: McpToolCall): Promise<McpToolResult>;
  close(): Promise<void>;
}

/**
 * Per-string redaction hooks. Each receives the shared vault so placeholders
 * stay stable across fields, tool calls, and conversation turns.
 */
// `tool` (optional) = the model-facing name of the tool whose result is being
// redacted, so a caller can apply per-connector policy (e.g. web-search results keep
// place/org names). The RedactingMcpClient binds it PER CALL, so it stays correct even
// when several tool calls run concurrently (no shared "current tool" state).
export type RedactString = (
  text: string,
  vault: Vault,
  tool?: string,
) => string | Promise<string>;
