[Français](README.fr.md)

# @openmasq/schema

**The persisted chat schema: the shapes OpenMasq writes to disk and syncs.**

`Message`, `Conversation` and their companions are declared once here. `@openmasq/ui`
re-exports them for the desktop app, and `@openmasq/sync` reads them to apply synced
conversations. The package holds types only, with no runtime code, and depends only on
`@openmasq/redact` for the redaction category names.

## What's inside

- **`Role`**: `"system" | "user" | "assistant"`.
- **`Message`**: one chat message as stored (`src/message.ts`).
- **`Conversation`**: a conversation and its settings (`src/conversation.ts`).
- **`AskTarget`**: the folder or file a question is about, local or in connected cloud storage,
  stored on the user message (`src/askTarget.ts`).
- **`RedactCategoryKey`**: the user-toggleable redaction categories, an alias of the
  engine's `RedactionCategory`.

```ts
import type { Conversation, Message } from "@openmasq/schema";
```

## Develop

```bash
pnpm --filter @openmasq/schema build       # tsup → dist/, rebuild before a consumer build
pnpm --filter @openmasq/schema typecheck
```

There are no tests here. A schema change is exercised by the consumers' builds and tests.

> [!IMPORTANT]
> Every field is a persisted key. Add optional fields only. Renaming or repurposing a field
> needs a storage migration on every reader.
