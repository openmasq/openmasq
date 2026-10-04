[English](README.md)

# @openmasq/connectors

**Les outils de connecteurs que l'application de bureau OpenMasq exécute dans son propre
processus.**

Chaque connecteur est un ensemble d'outils qui appellent l'API REST d'un fournisseur avec
un jeton obtenu par OAuth sur l'appareil. Aucun broker ni serveur ne s'intercale. Le code
est en TypeScript simple et n'utilise que `fetch`. Le processus principal de l'application
de bureau exécute ces outils (`apps/desktop/src/main/mcp/connectors/`), et leurs résultats
passent par le même masquage que tout autre résultat d'outil. `@openmasq/catalog` tient la
liste présentée à l'utilisateur et vérifie ses scopes OAuth par rapport à ce paquet.

## Contenu

- **Connecteurs** : GitHub, Gmail, Google Agenda, Drive, Docs, Sheets, Tasks et Analytics,
  Slack, Outlook, OneDrive, SharePoint et Teams. `CONNECTORS` les énumère et
  `getConnector(id)` en retrouve un.
- **Types** : `Connector`, `ConnectorTool`, `ConnectorToolCtx`, `ConnectorAuth` (`device`,
  `pkce`, `slack`, `microsoft`) et `ConnectorScopes`, dans `src/types.ts`.
- **Lecture de dossiers** : `RemoteEntry` (`src/files.ts`) avec `driveChildrenUrl`,
  `onedriveChildrenUrl` et leurs analyseurs. L'outil `list_folder` et le panneau Dossiers
  de l'application les partagent, et voient donc le même contenu.
- **Pièces jointes** : `AttachmentData` et `readAttachments`, pour les fichiers que
  l'application de bureau injecte dans un appel Gmail, Outlook, Drive ou OneDrive. Le
  modèle nomme les fichiers sans jamais en voir le contenu (`src/files.ts`).

```ts
import { getConnector } from "@openmasq/connectors";

const gmail = getConnector("gmail");
```

## Développer

```bash
pnpm --filter @openmasq/connectors build       # tsup → dist/, à relancer avant de compiler l'application de bureau
pnpm --filter @openmasq/connectors typecheck
pnpm test packages/connectors                  # depuis la racine du dépôt
```

> [!NOTE]
> Le jeton d'accès est transmis à chaque appel ; il n'est jamais stocké ni journalisé ici.
> Le verbe qui ouvre le nom d'un outil indique à l'agent s'il lit ou s'il écrit, et
> `src/toolNames.test.ts` le vérifie. Les invariants sont dans [`CLAUDE.md`](CLAUDE.md).
