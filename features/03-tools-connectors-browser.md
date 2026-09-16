## 3. Tools, connectors, browser

The moment the assistant stops answering and starts **acting** — and where the guardrails
stop being theoretical.

### Connectors (« Connecteurs »)
**Access**: Réglages → **Connecteurs**. One card per service; the card opens its modal. The
same modal opens **wherever you are**, anywhere a connector is named: the « Dossiers » panel
→ connected storage, the « Reconnexion nécessaire » pill, an integration offered inside a
conversation.

**What it makes possible.** Plugging in your services (mail, calendar, documents, CRM,
tickets, payments, code…) so the model reads them and acts inside them. Four families
coexist: remote ones (OAuth), on-device direct ones, local ones, and the ones you add
yourself. Several accounts per connector.

**What it gives you.** The tasks that are actually worth something are not "summarise this
text" but "look at my e-mails from this week and prepare the follow-up". That assumes access
to real data — exactly what redaction made impossible elsewhere.

**What it is worth.** The invariant that makes the combination possible: **every call leaves
in the clear and comes back redacted**. The service receives the real value (otherwise the
search finds nobody), the model only ever sees the substitute. Connectors you add yourself
stay in a separate section, marked unverified — the app does not pretend to have audited
them.

- [x] Remote (OAuth/DCR), on-device direct, local, added by you
- [x] OAuth sign-in in the system browser (the only place an SSO works)
- [x] Several accounts per connector, labelled
- [x] « Ajouter un connecteur », unverified, in its own section — the toolbar button beside
      the search field opens the name / URL / key form, behind a risk acknowledgement —
      `packages/ui/src/pages/Settings/mcp/McpCustomModal.tsx`
- [x] See the tools a connector exposes — `packages/ui/src/containers/modals/McpToolsModal.tsx`
- [x] Choice of access mode when the server offers two — `packages/ui/src/containers/modals/McpAuthChoiceModal.tsx`
- [x] Connectors from your other devices are offered for connection
- [x] Connect without leaving the screen: the connector's modal (connect / disconnect,
      accounts, tools) opens on top, from its card in Réglages → Connecteurs or from any
      mention of a connector — `packages/ui/src/pages/Settings/mcp/McpConnectorModal.tsx`,
      `packages/ui/src/pages/Settings/mcp/ConnectorModalHost.test.tsx`
- [x] An integration is **offered** under a reply only on a strong match — the service
      named, or an explicit ask only that tool honours — never a word in passing; at most
      two cards, once per conversation, and never on the turn a once-only card (Transparence,
      « Comprendre mon masquage », Mémoire) takes — `packages/ui/src/agent/integrationRelevance.ts`,
      `packages/ui/src/components/agent/integrationSlot.ts`
- [x] « Mes clés » inside a connector's modal: your own OAuth client id / secret for that
      service, with the per-provider checklist — `packages/ui/src/pages/Settings/byo/ByoKeysModal.tsx`
- [x] **Every call leaves in the clear and comes back redacted**
- [x] Enter an API key when the service asks for one — `packages/ui/src/containers/modals/ApiKeyModal.tsx`

### Local folders (the Filesystem connector)
**Access**: Réglages → Connecteurs → Filesystem. Once connected, the card lists the granted
folders.

**What it makes possible.** Giving the model access to folders **you designate**, and to
those alone. Several folders, added or removed at any time without disconnecting the
connector. The same folders are browsable from the right rail, while you write.

**What it gives you.** Working on your real files — a project folder, a tree of contracts —
without uploading them anywhere, and without opening the whole machine.

**What it is worth.** The perimeter is a real perimeter: a folder can only come from the
native picker (the application cannot grant one to itself), symbolic links are resolved and
refused if they lead out, and secret stores (`~/.ssh`, keychains, browser cookies, shell
histories) stay forbidden **even inside** a granted folder — because the picker invites
granting one's home directory. A removal takes effect immediately, not at the next launch.

- [x] Several folders, added/removed **without disconnecting** — `apps/desktop/src/main/mcp/stdioDirs.test.ts`
- [x] A folder can only come from the native picker (no self-granting) — a dropped folder
      only **opens that picker on it**, it does not grant itself
- [x] Sub-folders included, symbolic links resolved and refused if they lead out
- [x] Secret stores stay forbidden even inside a granted folder
- [x] Browse them **without leaving the conversation**: right rail → « Dossiers », an
      expandable tree; a file opens in the shared side panel —
      `packages/ui/src/containers/shell/folders/FolderTreePanel.tsx`
- [x] **Add a folder** from that same rail, or from the composer's « + » → « Dossier »
      (native picker; the grants already in place are kept — one gesture, two doors) —
      `packages/ui/src/hooks/useGrantFolder.ts`
- [x] **« Demander »** on hovering a folder (or clicking a cloud entry): the **open**
      conversation (a new one only when none is open — the same rule as the browser's
      « Demander à propos de cette page ») receives the target as a **tag** — folder/file
      and its service or path, a chip on the composer then on the message — which the model
      reads with the connector's tools; nothing is attached by default
- [x] **Connected storage** (Drive, OneDrive, Dropbox) is listed in the same place, with its
      state — `packages/catalog/src/mcp/registry.ts`
- [x] **Google Drive, OneDrive and Dropbox browse as a tree**, like the machine's folders —
      read-only, the token never leaves the privileged process —
      `apps/desktop/src/main/cloudfs/`
- [x] The model can **list a folder** on Drive/OneDrive, not only search it —
      `packages/connectors/src/files.ts`
- [x] Dropbox goes through **its own MCP server's listing**, tool name allow-listed and the
      response read back fail-closed — a server that returns no usable list keeps its status
      line rather than a dead chevron — `apps/desktop/src/main/cloudfs/mcpBrowse/`
- [x] Read, write (the model's tools), rename, create, move to trash (never a permanent delete) — the app-side preview is read-only, with no content editing
- [x] Find a file **by meaning** ("the tax documents"), the matching happening on the device
      and not in the model — `apps/desktop/src/main/fs/findRank.test.ts`
- [x] Without the local semantic engine, word matching stays whole **and says so** —
      `apps/desktop/src/main/fs/findFiles.test.ts`
- [x] A file cited in a reply (full path, or bare name if the conversation knows its single
      path) carries an **"open" icon** to its left that shows the real document in the side
      panel — only inside a granted folder —
      `packages/ui/src/components/markdown/blocks/MarkdownMark.test.tsx`

### Confirmation before acting
**Access**: automatic · the mode is set in Réglages → Connecteurs, setting
« **Confirmation des actions** ».

**What it makes possible.** Seeing and approving what the model is about to do **before** it
does it, with the real values involved — not a vague "it wants to write somewhere". Two
modes: standard (one card per conversation after an exposure to web content, plus uncapped
floors for exfiltration, attachments and anything that leaves) and reinforced (every write
confirms; the risky ones on a system window).

**What it gives you.** The confidence needed to loosen the reins: one can let an agent read
web pages and act, because the moment it would step outside the frame is precisely the one
that asks for a click.

**What it is worth.** Dosage is the whole subject. One confirmation per call teaches people
to click without reading — which is worse than no confirmation. Hence a per-conversation cap
on the ordinary case, and floors that are **never** capped on what cannot be undone: a send
leaves once. Going from reinforced to standard confirms itself on the system window, so that
a weakening cannot come from anywhere but you.

- [x] **Standard** mode: one card per conversation after a web search, plus the uncapped floors
- [x] **Reinforced** mode: every write confirms, the risky ones on a system window
- [x] The card says **which real values** are leaving, not merely "a write"
- [x] « Autoriser » is remembered per tool and per conversation
- [x] Going from reinforced to standard confirms itself on the system window
- [x] The card stays attached to ITS conversation (turns run in parallel)

### The driven browser
**Access**: the globe in the right rail of a conversation · Réglages → **Navigateur** (the
search engine) · Réglages → **Connecteurs** → « Ce que l'agent peut faire » (« **Sécurité du
navigateur agent** »: read-only mode, allowed domains).

**What it makes possible.** Giving the model a real browser — pages, forms, signed-in
sessions — in an isolated window, next to the conversation, which you watch working and can
take back control of.

**What it gives you.** The tasks that used to hit "the model has no web access" become
doable: check a piece of information, fill a form, follow a case online. And you **see** what
it does instead of reading a report about it.

**What it is worth.** This is the product's most exposed surface (a web page is hostile
content by default), so it is the one with the most guardrails: the tools are on an
**allow-list** — an addition on the vendor's side is refused by default, not permitted —,
the browser runs in its own process far from the rest of the app, and a search leaves with
the **real** value, otherwise it would be searching for someone who does not exist.

- [x] Isolated Chromium, in its own process, facing the chat — `apps/desktop/src/main/mcp/browser/`
- [x] Tools on an **allow-list** (everything else is refused by default)
- [x] A search leaves with the **real** value, and the page comes back redacted
- [x] « **Demander à propos de cette page** » under the view: it seeds the question in the
      current conversation, with the address — `packages/ui/src/pages/ChatWorkspace/BrowserPanel/browserTarget.ts`
- [x] Choice of search engine
- [x] Taking back control, visible tabs
- [ ] Adding a bookmark — the star has been retired; bookmarks already saved stay displayed
      and clickable, no new one is added
- [ ] Browsing without the model seeing the page (what is read enters the turn)
