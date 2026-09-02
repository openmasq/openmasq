# @openmasq/mcp — the redacting MCP client

<sub>**English** · [Français](#openmasqmcp--le-client-mcp-masquant) · [openmasq.com](https://openmasq.com)</sub>

A Model Context Protocol client where **every tool call goes through the vault in both
directions**: arguments leave un-redacted (the outside world gets real values), results
come back re-redacted before the model sees them. `./transport` carries the transports
(stdio, Streamable HTTP) the desktop wires into its process boundary.

**Boundary.** Depends on `@openmasq/redact` only. The desktop decides which tools are
allowed (allow-listed, never deny-listed) — this package executes what it is handed.

**Start here.** `src/index.ts`; the un-redact / re-redact pair is the invariant to keep.

---

# @openmasq/mcp — le client MCP masquant

Un client Model Context Protocol où **chaque appel d'outil passe par le coffre dans les deux
sens** : les arguments partent démasqués (le monde extérieur reçoit de vraies valeurs), les
résultats reviennent re-masqués avant que le modèle ne les voie. `./transport` porte les
transports (stdio, Streamable HTTP) que le bureau câble dans sa frontière de processus.

**Frontière.** Ne dépend que de `@openmasq/redact`. Le bureau décide quels outils sont permis
(sur liste d'autorisation, jamais d'interdiction) — ce paquet exécute ce qu'on lui remet.

**Commencez ici.** `src/index.ts` ; la paire démasquer / re-masquer est l'invariant à tenir.
