/**
 * @openmasq/schema — the CANONICAL persisted chat schema (`Role` / `Message` /
 * `Conversation`), shared VERBATIM by every surface that stores conversations: the
 * desktop app (`@openmasq/ui` re-exports these), the browser extension
 * (`apps/extension/src/storage`), and cross-device sync. Types-only, zero runtime.
 *
 * Previously the desktop's `packages/ui/src/types.ts` was the source and the
 * extension kept a hand-maintained duplicate (`storage/types.ts`) guarded only by a
 * reminder note — a footgun on PERSISTED data. This package is the single source so
 * the two can never drift. Only depends on `@openmasq/redact` (the fine
 * `RedactionCategory` vocabulary). `Message` and `Conversation` live in their own
 * files (rule 1) and are re-exported here, so every importer resolves unchanged.
 */
import type { RedactionCategory } from "@openmasq/redact";

/**
 * The user-toggleable redaction categories. This is the ENGINE's own
 * `RedactionCategory` vocabulary (single source) — the two were previously
 * duplicated and out of sync. `secret` groups all keys/tokens/JWT/connection-
 * strings/passwords; `apikey` is the noisy generic random-string heuristic (off by
 * default). `number` (bare figures) is RETIRED from the product — no toggle on any
 * surface; the `redactNumbers` setting is its only control.
 */
export type RedactCategoryKey = RedactionCategory;

export type { Role, Message } from "./message";
export type { AskTarget } from "./askTarget";

// The Conversation shape lives in `conversation.ts` (rule 1 split); re-exported
// so every `@openmasq/schema` import keeps resolving unchanged.
export type { Conversation } from "./conversation";
