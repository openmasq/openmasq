[Français](README.fr.md)

# @openmasq/connectors

**The connector tools the OpenMasq desktop app runs in its own process.**

Each connector is a set of tools that call a provider's REST API with a token obtained by
on-device OAuth. No broker or server sits in between. The code is plain TypeScript and uses
only `fetch`. The desktop main process runs these tools
(`apps/desktop/src/main/mcp/connectors/`), and their results go through the same redaction
as any other tool result. `@openmasq/catalog` keeps the user-facing list and checks its
scopes against this package.

## What's inside

- **Connectors**: GitHub, Gmail, Google Calendar, Drive, Docs, Sheets, Tasks and Analytics,
  Slack, Outlook, OneDrive, SharePoint and Teams. `CONNECTORS` lists them and
  `getConnector(id)` finds one.
- **Types**: `Connector`, `ConnectorTool`, `ConnectorToolCtx`, `ConnectorAuth` (`device`,
  `pkce`, `slack`, `microsoft`) and `ConnectorScopes`, in `src/types.ts`.
- **Folder listing**: `RemoteEntry` (`src/files.ts`) with `driveChildrenUrl`,
  `onedriveChildrenUrl` and their parsers. The `list_folder` tool and the app's folder panel
  share them, so both see the same listing.
- **Attachments**: `AttachmentData` and `readAttachments`, for the files the desktop injects
  into a Gmail, Outlook, Drive or OneDrive call. The model names the files and never sees
  their bytes (`src/files.ts`).

```ts
import { getConnector } from "@openmasq/connectors";

const gmail = getConnector("gmail");
```

## Develop

```bash
pnpm --filter @openmasq/connectors build       # tsup → dist/, rebuild before the desktop build
pnpm --filter @openmasq/connectors typecheck
pnpm test packages/connectors                  # from the repository root
```

> [!NOTE]
> The access token is passed to each call and is never stored or logged here. A tool's
> leading verb tells the agent whether it reads or writes, and `src/toolNames.test.ts`
> enforces it. The invariants are in [`CLAUDE.md`](CLAUDE.md).
