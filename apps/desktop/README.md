# @openmasq/desktop — the product

<sub>**English** · [Français](#openmasqdesktop--le-produit) · [openmasq.com](https://openmasq.com)</sub>

The Electron app: `src/main` (IPC, SQLite, MCP, streaming, the process boundaries),
`src/preload` (`contextBridge` → `window.openmasq`), `src/renderer` (mounts `@openmasq/ui`
and supplies the real `Host`). `e2e/` drives the built app against real providers — it
costs money, never run it casually.

**Boundary.** Every trust boundary of the product is here: IPC handlers, `spawn` /
`utilityProcess`, network egress, secrets at rest, the Python jail, the agent browser. A
change there is not done until the fail-closed property is re-verified and pinned by a
test (root `CLAUDE.md`, rule 7). The renderer is untrusted for security decisions.

**Start here.**
- `src/main/index.ts` — boot; `src/main/ipc/` — the handlers; `src/main/db/` — the local
  database and its migrations; `src/main/mcp/` — connectors, tool gates, the broker.
- `scripts/buildDefines.ts` — every service address a build may receive, and why none has
  a committed default.
- `pnpm dev` from the repo root builds the packages and launches the app against the
  same public services as a build; `.env.development` says how to point it at a local
  stack instead (`.env.development.local`).

---

# @openmasq/desktop — le produit

L'application Electron : `src/main` (IPC, SQLite, MCP, streaming, les frontières de
processus), `src/preload` (`contextBridge` → `window.openmasq`), `src/renderer` (monte
`@openmasq/ui` et fournit le vrai `Host`). `e2e/` pilote l'application construite contre de
vrais fournisseurs — ça coûte de l'argent, ne le lancez jamais à la légère.

**Frontière.** Toutes les frontières de confiance du produit sont ici : les gestionnaires
IPC, `spawn` / `utilityProcess`, les sorties réseau, les secrets au repos, la prison Python,
le navigateur agent. Un changement là n'est pas fini tant que la propriété d'échec fermé n'a
pas été revérifiée et épinglée par un test (`CLAUDE.md` racine, règle 7). Le renderer n'est
pas de confiance pour les décisions de sécurité.

**Commencez ici.**
- `src/main/index.ts` — le démarrage ; `src/main/ipc/` — les gestionnaires ; `src/main/db/` —
  la base locale et ses migrations ; `src/main/mcp/` — connecteurs, portes d'outils, broker.
- `scripts/buildDefines.ts` — chaque adresse de service qu'un build peut recevoir, et
  pourquoi aucune n'a de défaut commité.
- `pnpm dev` depuis la racine du dépôt construit les paquets et lance l'application contre les
  mêmes services publics qu'un build ; `.env.development` dit comment la pointer plutôt vers
  une pile locale (`.env.development.local`).
