## 2. Conversations

The core of daily use: this is the screen one lives in.

### Writing, sending, receiving
**Access**: the **Conversations** section (left rail, or ⌘K).

**What it makes possible.** A classic multi-model conversation — streamed reply, stop
mid-flight, edit, regenerate — with two differences: the composer **shows** what will be
masked while you type, and several conversations run in parallel, each with its own turn,
its own rules and its own vault.

**What it gives you.** Nothing new to learn compared with an ordinary chatbot, except that
you watch the protection work before sending. Working in parallel changes the rhythm: you
launch a long search in one tab and keep writing in another, instead of waiting.

**What it is worth.** The splittable workspace (two conversations side by side, or a
conversation and a document) avoids the constant back-and-forth between windows — that is
what makes real document work bearable. Drafts are never written to disk: a half-written
message, necessarily the most sensitive one, stays in memory.

- [x] Composer with live highlighting of what will be redacted — `packages/ui/src/pages/ChatWorkspace/Composer/`
- [x] **One « + » door** in the action row for everything that joins a message — « Fichier »
      (the native picker), « Dossier » (grant a folder, same gesture as the right rail's),
      « Connecteur » (the catalogue, Réglages → Connecteurs), « Compétence » (the palette) —
      each entry present only where its way in exists; « / » stays the keyboard way to the
      compétences, in the same single palette — `packages/ui/src/pages/ChatWorkspace/ComposerAddMenu.tsx`
- [x] « Nouvelle conversation » **creates** nothing: it shows the welcome screen, and the
      conversation is born on the **first send** — no more empty « Nouvelle conversation »
      rows in the list after a click with no follow-up — `packages/ui/src/workspace/layout/ops.ts` (`showWelcome`)
- [x] Sending is blocked while the analysis runs (the button says so)
- [x] Streamed reply, stoppable (« Stop »)
- [x] The model's reasoning shown during the wait, when the model produces one (DeepSeek, Qwen, Nemotron, Claude, Gemini, OpenRouter…) — un-redacted like the reply; otherwise the loader alone, nothing invented — `packages/ui/src/state/conversation/reasoningRelay.ts`
- [x] …and **kept** once the reply lands: a collapsed « Réflexion » line above the reply, expandable, surviving a reload (encrypted database only) — `packages/ui/src/components/message/ReasoningPanel.tsx`
- [x] Starters on an empty conversation, in **two rows of four**: « Sans rien configurer »
      (writing, search, memory, analysis — nothing to set up) and « Avec vos services »
      (sort your mailbox, find a document, prepare your day, catch up on your channels),
      each card carrying its service's mark — `packages/ui/src/pages/ChatWorkspace/starters.ts`
- [x] A service that is NOT connected folds into a **chip** on a single line (« Ou connectez :
      Gmail · Drive · Agenda ») that opens the connector modal over the screen; it never
      offers a question nothing could honour
- [x] « **Voir les autres** » at the end of that line opens the full catalogue
      (Réglages → Connecteurs): the chips only carry the starters' services —
      `packages/ui/src/pages/ChatWorkspace/EmptyPromptSuggestions.tsx`
- [x] « **Ne plus proposer** » hides the starters, and « Voir des exemples » brings them back
      in the same place (`Settings.startersOff`)
- [x] Several conversations in parallel, each with its own turn
- [x] **One status slot** under a reply — failed, interrupted, empty, or a failed tool step:
      the same card, a variant per reason, and a single « Réessayer » that regenerates in
      place; the credits card is its amber variant — `packages/ui/src/components/message/TurnStatus/`
- [x] Conversation tabs + a splittable workspace — `packages/ui/src/workspace/`
- [x] Drafts kept per conversation, **in memory only**
- [x] Full-screen editor for a long draft, with a Preview tab — opened by clicking the
      collapsed draft card in the composer — `packages/ui/src/pages/ChatWorkspace/ComposerTextModal.tsx`
- [x] Delete a conversation; open several in tabs
- [x] Rename or delete a conversation from its row in the list (⋯ on hover):
      **in-place** rename, confirmed deletion — `packages/ui/src/containers/shell/ConvRow.tsx`
- [x] An interrupted tool turn (close, crash, update) **resumes** instead of redoing
      everything, and an action whose outcome is unknown is reported as such to the model
      rather than blindly replayed — `packages/ui/src/agent/turnCheckpoint.ts`
- [x] A conversation too long for the model keeps a **summary of its beginning** instead of
      losing it silently — `packages/ui/src/send/contextSummary.ts`
- [x] Usefulness warning: a pill says when the reply will depend on a redacted value (computed age, distance, unknown company) — "keep in the clear" or ignore — `packages/ui/src/pages/ChatWorkspace/utilityRisk.ts`
- [ ] Queueing a send fired during the analysis (the Enter key is ignored)

### Choosing and switching model
**Access**: the model's name under the composer · Réglages → **Modèles** (« Liste de
modèles ») for the default and your accesses.

**What it makes possible.** Switching model at any time, including mid-conversation. The
picker only lists what **you** can send with: the free models, those covered by your
subscription (Scaleway in France + a selection of OpenRouter) and those whose key you have
entered (OpenAI, Anthropic, Google, Mistral, DeepSeek, OpenRouter) — plus **the model
running on your own machine**. Each card carries its price, its context window, its
strengths and weaknesses, and the flag of the country where inference is hosted.

**What it gives you.** The right model for the task, without changing tool or
subscription: a free model to draft, a reasoning model for a hard file, a French model when
jurisdiction matters, a local model when nothing may leave at all.

**What it is worth.** The OpenRouter catalogue is fetched live rather than maintained by
hand, so identifiers do not rust. The model that answered stays stamped on its reply:
re-reading an old conversation means knowing who wrote what.

- [x] Filterable list (search + family + price) — `packages/ui/src/pages/Settings/models/`
- [x] **Only usable models are offered**: subscription, entered keys, free ones. An
      unconfigured local model stays visible but greyed (it is fixed on your machine), and
      the current model never disappears from its own list —
      `packages/ui/src/send/modelAvailability.test.ts`
- [x] At the top of the list, **your accesses**: one small clickable card per provider,
      with its state (key stored / included / to add); a click opens its key — and for
      OpenRouter, the same window offers « **Obtenir une clé gratuitement** »
      (authorization in the browser, the key is born on YOUR account). The subscription is
      offered once, under the grid: it is a fact about the account, not about a provider —
      `packages/ui/src/pages/Settings/models/ProviderAccess.test.tsx`
- [x] **Neither subscription nor key ⇒ a discreet pill** says so once, in the app's bottom
      corner (expanded on click), and leads to « Vos accès ». It announces what is MISSING,
      never a blockage (free models work with nothing), stays quiet for an organization
      member — their accesses are not theirs to buy — and while billing has not loaded —
      `packages/ui/src/state/auth/accessNotice.test.ts`
- [x] The key window SAYS a key is already stored (without ever reading it back: it lives
      encrypted on the privileged side), offers to **replace** it, and to **remove** it
      — `packages/ui/src/containers/modals/ApiKeyModal.tsx`
- [x] **Hosting jurisdiction** flag per model
- [x] Default model for new conversations
- [x] « **Modèle sur votre ordinateur** » (Ollama / LM Studio / llama.cpp, on this machine
      OR a LAN box) — Réglages → Modèles: the address, and the picker's list read LIVE from
      the server's own `/models` (a static Ollama baseline until it answers), plus a field
      for ids the server doesn't list — `packages/ui/src/hooks/useLocalModels.ts`,
      `apps/desktop/src/main/net/localEndpoint.ts`
- [x] « **Votre abonnement Claude** » (opt-in, OFF by default) — Réglages → Modèles: if the
      Claude Code CLI is installed and signed in, a « Claude Code » group is added to the
      picker, with no API key — the subscription's default plus the Sonnet / Opus / Haiku
      families (Opus depending on the plan), served by the CLI locally, redaction
      unchanged. **The app's connectors work there as on a keyed model**: the app's own
      loop drives, a local MCP bridge capturing the tool call so that it goes through the
      vault and the write gate (the call leaves un-redacted, the result comes back
      re-redacted) — `apps/desktop/src/main/subscription/`
- [x] « **Votre abonnement ChatGPT** » (opt-in, OFF by default) — Réglages → Modèles:
      the same pattern with the **Codex** CLI installed and signed in: the « Codex » model
      is added to the picker, with no API key, served by the CLI locally — ephemeral
      session, user config ignored, command execution cut off, read-only sandbox —
      redaction unchanged. **The app's connectors work there too**, through the same MCP
      bridge as Claude Code (the call is captured, then goes through the app's vault and
      write gate) — `apps/desktop/src/main/subscription/codexEngine.ts`,
      `apps/desktop/src/main/subscription/codexToolsTurn.ts`
- [x] « **Votre abonnement Google Antigravity** » (opt-in, OFF by default) — Réglages →
      Modèles: same pattern with the **Antigravity** CLI (`agy`) installed and signed in:
      an « Antigravity » model is added to the picker, with no API key, served by the CLI
      locally — its settings AND its conversation history isolated in a data dir of ours,
      every permissioned tool auto-denied by the headless mode — redaction unchanged.
      **The app's connectors work there too**, through the same MCP bridge: it rides a
      plugin in a disposable folder passed by `--add-dir`, and the ONE permission our data
      dir grants is that server's (`mcp(openmasq/*)`) — the user's own configuration is
      never written — `apps/desktop/src/main/subscription/antigravityEngine.ts`,
      `apps/desktop/src/main/subscription/antigravityToolsTurn.ts`
- [x] **The agent's account card** — opening an agent's chip shows what ITS CLI says
      about the account, read by spawning the CLI (never its credentials): Codex's plan,
      quota window (% used, reset time) and live model list via `codex app-server`;
      Antigravity's live model list via `agy models`; Claude's quota as announced during
      the last send (`rate_limit_event`), remembered — that CLI exposes nothing to ask —
      `apps/desktop/src/main/subscription/account.ts`,
      `packages/ui/src/pages/Settings/models/AgentAccountCard.tsx`
- [x] OpenRouter catalogue fetched live
- [x] The model that answered stays stamped on the reply
- [ ] **« Auto » mode** — REMOVED from the picker: neither view offers it any more. The
      router stays in place and serves the conversations already pinned to it (the model is
      chosen at each send according to the task, only among what the account can actually
      send with; a « choisi automatiquement · via votre abonnement » caption on each routed
      reply) — `packages/ui/src/send/autoRoute.test.ts`,
      `packages/ui/src/send/autoTaskIntent.test.ts`
- [x] An unreachable model explains what it takes to reach it — `packages/ui/src/containers/modals/ModelAccessModal.tsx`
- [x] **The default follows the access path**: a subscription CLI switched on AND found (Claude Code, Codex, Antigravity) leads the short list and becomes the model of new conversations, until a default is picked by hand — `packages/ui/src/prompt/defaultModel.ts`
- [x] **Two picker views**: **simplified by default** (a short list of favourites, no price
      and no flag) or full (every provider, columns + search) — toggled from the menu, both
      ways, and remembered —
      `packages/ui/src/components/ModelSelector/simpleList.test.ts`
- [x] **The short list is CUSTOMISABLE** (the « Modèles favoris » setting): a star on each
      model (in the full picker as in Réglages → Modèles) pins it; the favourites then
      REPLACE the default list. Empty = the governable factory list; favourites that have
      all become unreachable fall back to it so the menu is never empty. Device-local —
      `packages/ui/src/components/ModelSelector/simpleList.test.ts`
- [x] **The default model is designated FROM the menu**: a home marker on each row, filled
      on the current default, clickable elsewhere to become it — the same setting as
      Réglages → Modèles, now within reach of the chat —
      `packages/ui/src/components/ModelSelector/ModelRow.test.ts`
- [x] The default list is made only of models usable **without a subscription**, and the
      current model is always in it, even outside favourites
- [x] A provider appears only if it is **reachable**: Scaleway through the subscription,
      OpenRouter through the subscription OR your key, the other five through your key only

### Files inside a conversation
**Access**: the composer's « + » → **Fichier**, or **drag and drop** a file or a folder onto
the conversation (pasting works too).

**What it makes possible.** Dropping a PDF, a scan, an image, an Office document, a CSV —
and sending it **already masked**. The text is extracted, a scan goes through OCR with its
text layer reconciled, and redaction happens **on drop**, before any send. A preview shows
three views: the document, its redacted version, the OCR layer.

**What it gives you.** Documents are where sensitive data is actually concentrated — and
precisely what one did not dare drop anywhere. Here you see, before sending, exactly what is
masked and what is not; and you can mask one more word by hand, by selection or by clicking
a word on the page.

**What it is worth.** Redaction on drop, with a preview, turns a risky act into a verifiable
one. And a mapping card that has gone stale (the rules have changed since) is **flagged**
rather than silently reused: that is what stops yesterday's protection from passing for
today's.

- [x] PDF, images, Office (docx/pptx/xlsx), CSV, text
- [x] **Drag and drop**: a file is attached to the message — `packages/ui/src/pages/ChatWorkspace/dropIntake.ts`
- [x] Dropping a **folder** offers to add it to the granted folders; the confirmation
      happens in the system's own window, never in the app — `packages/ui/src/pages/ChatWorkspace/grantDroppedFolder.ts`
- [x] OCR on a scan, with a reconciled text layer — `packages/redact/src/ocr/`
- [x] **The OCR ceiling is VISIBLE and liftable** — 10 pages by default (several seconds each: a 300-page file is a choice, not an imposed wait); beyond that the chip says « 10/32 pages lues » and offers « Lire tout » (re-extraction with no ceiling, same choreography as the first: progress, re-redaction) — `packages/ui/src/pages/ChatWorkspace/ocrShortfall.ts`
- [x] In the preview, a **halo** (theme tint, light wash) marks the text that, once redacted, goes to the model; the first page's caption is a **button** that hides/shows the halo (preference remembered) — `packages/ui/src/containers/modals/viewers/pdf/textHalo.ts`
- [x] Document redaction **on drop**, before any send
- [x] Preview before sending: the document (Pages redacted / Feuille / Image…) · Original · Redacted (« what will leave the machine », cut at the send limit) · the image's text — with the redaction state (running / failed / count) in the header — `packages/ui/src/containers/modals/viewers/AttachmentPreviewModal.tsx`
- [x] Redact a word by hand in the preview (selection or click on a word)
- [ ] Sending a document as **redacted images** to a multimodal model — not offered: a
      document leaves as its extracted, masked text (the « texte ou fichier » choice was removed)
- [x] A card that has aged (rules changed) is flagged + can be re-redacted
- [x] An unfinished or failed document blocks the send

### Gestures on text
**Access**: a selection in the composer or in a message → context menu.

**What it makes possible.** Taking back control of detection, both ways: masking a value
nothing spotted (choosing its type), or keeping in the clear a value detected by mistake.
Plus the usual conversation gestures — copy, regenerate, edit — and « Préciser », which
quotes a passage of the reply into the composer.

**What it gives you.** No detector is perfect; what matters is that the correction takes two
seconds and **persists**. A value masked by hand stays masked in every following message of
the conversation.

**What it is worth.** This is the release valve that makes the system usable day to day:
without it, a single false detection on a frequent word would make the conversation
unreadable, and a single miss would force everything to be rewritten elsewhere.

- [x] « Masquer » a chosen value, with its type — `packages/ui/src/components/SelectionMenu.tsx`
- [x] « Garder en clair » a detected value (click on the highlight, or the pill)
- [x] « Préciser »: quote a passage of the reply into the composer
- [x] Copy / regenerate / edit a message
- [x] `/` opens the palette: skills (routines included), « **Retenir en mémoire** » — `packages/ui/src/pages/ChatWorkspace/slashPalette.ts`

### Artifacts and code
**Access**: automatic when the model produces a document or long code.

**What it makes possible.** Taking the result out of the thread: a document or a long piece
of code opens in a panel next to the conversation. Python code runs in an OS-level sandbox,
a generated document exports to PDF.

**What it gives you.** Going from "the model wrote something" to "I have a usable file"
happens without leaving the app or pasting the text somewhere else.

**What it is worth.** Code produced by a model runs on **un-redacted** — hence real — data.
That is why it runs under an OS jail, in its own process, and not inside the application:
convenience is not paid for in attack surface.

- [x] Artifact side panel — `packages/ui/src/pages/ChatWorkspace/ArtifactPanel/`
- [x] Python code execution in an OS sandbox — `apps/desktop/src/main/python/`
- [x] Export of a generated document to PDF — `apps/desktop/src/main/pdf/`
- [x] **Designed as a document, not as a reply**: the model receives a design brief
      (structure by type — letter/report/note —, tables for comparisons, forbidden
      renderings), and the export applies **French micro-typography** (non-breaking spaces
      before « : ; ! ? », inside « », thousands and units bound together — never inside
      code) — `packages/ui/src/components/export/microTypography.ts`
- [x] **In-place editing** of a generated document: click the text and write, formatting preserved, `# `/`- `/`1. `/`> ` shortcuts and ⌘B/⌘I/⌘E — `packages/ui/src/components/markdown/blocks/DocumentCard/editor/DocumentEditor.tsx`
- [x] Spreadsheet preview (CSV/XLSX), read-only — `packages/ui/src/containers/modals/SpreadsheetViewer/`
- [x] One single path to open what a reply produces (a deliverable) — `packages/ui/src/containers/shell/hooks/useOpenDeliverable.ts`
- [ ] Running a language other than Python
