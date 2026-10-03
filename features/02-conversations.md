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
- [x] Starters on an empty conversation, **one row** that works with nothing connected: a
      client follow-up, a contract excerpt, an HR review — each carrying invented personal
      data that is visibly masked before it leaves — and memory. **Never an offer to connect**;
      a second row « Avec vos services » appears only for a CONNECTED Slack, Notion, OneDrive
      or Dropbox, naming it (catch up on Slack, find meeting notes in Notion, find a quote) —
      `packages/ui/src/pages/ChatWorkspace/starters.ts`,
      `packages/ui/src/pages/ChatWorkspace/EmptyPromptSuggestions.tsx`
- [x] « **Ne plus proposer** » hides the starters, and « Voir des exemples » brings them back
      in the same place (`Settings.startersOff`)
- [x] Several conversations in parallel, each with its own turn
- [x] **One status slot** under a reply — failed, interrupted, empty, or a failed tool step:
      the same card, a variant per reason, and a single « Réessayer » that regenerates in
      place; the credits card is its amber variant — `packages/ui/src/components/message/TurnStatus/`.
      A retry resends EVERY document of the turn or nothing: a file the library cannot give
      back is named on the card — `packages/ui/src/send/retryResend.ts`
- [x] Conversation tabs + a splittable workspace — `packages/ui/src/workspace/`
- [x] Drafts kept per conversation, **in memory only**
- [x] Full-screen editor for a long draft, with a Preview tab — opened by clicking the
      collapsed draft card in the composer — `packages/ui/src/pages/ChatWorkspace/ComposerTextModal.tsx`
- [x] A paste that folds the draft into that card keeps the keyboard there: the card takes
      the focus and ⌘Z / Ctrl+Z right after restores the draft as it was, textarea and caret
      included — `packages/ui/src/pages/ChatWorkspace/Composer/useLongPasteUndo.ts`
- [x] A long sent message (over ~1,500 characters or 16 lines) is **folded** in the thread,
      « Afficher tout » / « Réduire »; its marks, selection menu and copy are unchanged, and an
      opened message stays open while scrolling — `packages/ui/src/components/message/bubbleFold.ts`
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
- [x] « **Modèle local** » (Ollama / LM Studio / llama.cpp, on this machine
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
- [x] **A signed-out agent says so, and signs back in** — when a CLI's own session is
      missing or expired (its status says signed out, or a send comes back refused for it),
      the model is greyed « Non connecté » in the picker and the send is refused before
      anything leaves; the conversation shows « Votre session Claude Code a expiré… », never
      the CLI's raw text, with « Se reconnecter »: the CLI's own sign-in, in place, then the
      turn is replayed (Claude Code, Codex — Antigravity is signed in from the tool itself) —
      `apps/desktop/src/main/subscription/authFailure.ts`,
      `packages/ui/src/containers/agentSetup/CliReconnectModal.tsx`,
      `packages/ui/src/state/effects/cliSession.ts`
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
- [x] **A PDF is read WHOLE**: OCR reads every page that may hold what the text layer lacks (a scan, an image, a filled form field, a stamp), with « OCR… page x/y » progress; a page of a digital PDF whose text layer proves complete is not rasterised, so a digital document attaches without the OCR wait; a page whose ONLY unproved content is images (a logo, a stamp) has OCR read just those image areas, not the whole page. A scan whose estimate (≈ 3,000 characters a page) passes the masking limit is refused BEFORE the first page; an OCR failure puts the file in error (« Ce PDF n'est pas joint : ses N pages en image n'ont pas pu être lues… »), never attached with part of its pages — `packages/redact/src/documents/pdfExtract.ts`, `packages/redact/src/documents/layers/ocrSkip.ts`, `packages/redact/src/documents/layers/imageRegions.ts`
- [x] A file read under the FORMER 10-page ceiling (a library re-attach) still says « 10/32 pages lues » and offers « Lire tout », the whole-document re-read; until re-read whole it is NOT sendable (« Relisez-le en entier… ») — `packages/ui/src/pages/ChatWorkspace/ocrShortfall.ts`, `packages/ui/src/pages/ChatWorkspace/submitGuard.ts`
- [x] A dropped file whose extraction returns an error keeps NO text: it is in error, never sent in part — `packages/ui/src/pages/ChatWorkspace/extractDropped.ts`
- [x] In the preview, a **halo** (theme tint, light wash) marks the text that, once redacted, goes to the model; the first page's caption is a **button** that hides/shows the halo (preference remembered) — `packages/ui/src/containers/modals/viewers/pdf/textHalo.ts`
- [x] Document redaction **on drop**, before any send — over the **whole** extracted text, never
      a first slice: the send reuses that map, and so does the library's masked copy of a
      DOCX/XLSX — `packages/ui/src/pages/ChatWorkspace/redactAttachment.ts`
- [x] **A document is masked in full or refused, never in part.** Past ~80,000 characters (≈ 20 s
      of masking) the chip says « Masquage · 40 % · environ 3 min », its tooltip « Document long :
      masquage en cours, environ N min »; past 1,000,000 characters (≈ 4 min) it is refused before
      masking: « Document trop long pour être masqué en entier (≈ N pages). Découpez-le en
      plusieurs parties. » A scanned PDF is checked against the same limit before its OCR starts. A
      masking past its deadline (scaled to the size) fails the chip with « Réessayer », never
      sendable unmasked — `packages/redact/src/documents/safety/maskBudget.ts`
- [x] **Size limits stated, checked before reading**: a file over 50 MB is refused before it is
      read (picked: on its size on disk; dropped: before it is loaded) — « Fichier trop volumineux
      (50 Mo maximum). Découpez-le en plusieurs parties. »; a PDF over 2,000 pages is refused
      whole (« PDF trop long (N pages, 2000 maximum)… »), never read up to a page cap —
      `packages/redact/src/documents/safety/guard.ts`
- [x] Preview before sending: the document — EVERY page, painted as it nears the viewport (`packages/ui/src/containers/modals/viewers/pdf/lazyPages.ts`) — (Pages redacted / Feuille / Image…) · Original · Redacted (« what will leave the machine », the WHOLE text: a document is sent whole) · the image's text — with the redaction state (running / failed / count) in the header — `packages/ui/src/containers/modals/viewers/AttachmentPreviewModal.tsx`
- [x] The preview opens while the file is still being read (OCR) or first masked: a loader with the page being read / the masking progress, then the redacted document as soon as it lands — never the document unmasked in the meantime — `packages/ui/src/containers/modals/viewers/AttachmentPendingPreview.tsx`
- [x] **Progressive preview while masking**: the passages already masked show, masked (fakes and their marks), under « Aperçu provisoire : chaque passage s'affiche une fois masqué… » — every value found so far is masked across the whole shown part (re-applied on each step), only a value not yet reached may still show; the rest is a « Masquage en cours… N % » placeholder, never its text — `packages/ui/src/containers/modals/viewers/doc/partialPreview.ts`
- [x] **A PDF opened while it is read or masked is the REAL viewer from the start**: each page appears as the page itself with its masks painted once it is read AND masked, marked provisional (« Aperçu provisoire : une page s'affiche une fois lue et masquée… ») and repainted when a value found further on masks it too; until then a page shows only its thumbnail, too small to read (rendered at most 40 px wide in the extraction process, then blurred), with its state (« en attente de lecture » / « lecture en cours » / « lue, masquage en cours »). A scanned page keeps its thumbnail until the end (its boxes need the OCR geometry). When the masking lands the same viewer simply becomes final — no reload, no reopening. Other formats keep the progressive text view above — `packages/ui/src/containers/modals/viewers/pdf/pendingPages.ts`, `packages/redact/src/ocr/pdfThumbs.ts`
- [x] **A PDF is masked WHILE it is read**: the pages whose final text is known (a digital PDF at once, a scan page by page as OCR reads it) are masked with the real engine as they come, and the masking only finishes the tail once reading ends — the same chunks and the same map as masking afterwards, each page masked once (26-page statement: 79 s in sequence → ~71 s). The send stays blocked until the WHOLE document is masked; a scan whose text is only decided at the end (sparse scan), a detector error or a settings change masks the whole text afterwards, as before — `packages/ui/src/pages/ChatWorkspace/readingMask.ts`, `packages/redact/src/viewer/chunkMask.ts`
- [x] **Page strip at the top of the PDF preview**: one small tile per page (its state while read and masked, the page in view marked); a click or ←/→, ↑/↓ jumps page to page, also once the preview is final — `packages/ui/src/containers/modals/viewers/pdf/PageStrip.tsx`, `packages/ui/src/containers/modals/viewers/pdf/usePageNav.ts`
- [x] **Several documents are masked ONE at a time**, in order: a waiting one says « Masquage en attente · N avant », the running one its percentage, and a long one's minutes left are measured on its own pace once a part is done — `packages/ui/src/state/files/maskQueue.ts`
- [x] **Masking survives navigation**: switching conversation (or going to Bibliothèque) and coming back shows the run where it is, never restarted; removing the chip or deleting the conversation cancels it — `packages/ui/src/pages/ChatWorkspace/stagedStore.ts`
- [x] A conversation whose files are still being read or masked wears a small spinner on its sidebar row and its tab (« Fichiers en cours de lecture ou de masquage »); the chip itself wears a soft moving rainbow border while it is read, waiting or masked (still under reduced motion) — `packages/ui/src/state/files/stagedActivity.ts`, `packages/ui/src/styles/composer/attachGlow.css`
- [x] Several documents at once: read ONE at a time, in order; each chip finishes on its own (the first one ready opens while the others wait) and a waiting one says « En attente · N avant » — `apps/desktop/src/main/ocr/extractQueue.ts`, `packages/ui/src/pages/ChatWorkspace/extractPicked.ts`
- [x] Redact a word by hand in the preview (selection or click on a word)
- [x] **Many files** (8 or more): one summary line « 32 fichiers · 3 en lecture · 1 illisible »,
      the chips in a bounded scrolling area, and « Tout retirer » (asks once, on the button) —
      each file removed through the same path as its own ×, masking in flight cancelled —
      `packages/ui/src/pages/ChatWorkspace/AttachmentChips/`
- [ ] Sending a document as **redacted images** to a multimodal model — not offered: a
      document leaves as its extracted, masked text (the « texte ou fichier » choice was removed)
- [x] A card that has aged (rules changed) is flagged + can be re-redacted
- [x] A document still being read (or queued), still masked, or whose masking failed blocks the send — the button says « Lecture » / « Masquage » and the draft stays; one that could not be read is NAMED in a confirmation (« Envoyer sans eux » / « Annuler ») before a send without it, never dropped silently — `packages/ui/src/pages/ChatWorkspace/submitGuard.ts`
- [x] A message that **does not fit the chosen model's context window** (typed text + the WHOLE text of every attached document, estimated, against the window minus the reply's room) is refused BEFORE masking, naming its approximate size and the model's window, and suggesting a larger-context model or fewer files; the draft and the files stay — `packages/ui/src/send/contextFit.ts`
- [x] **Sent files stay compact**: small cards two to a row under the message; past 4 files, one
      « 8 fichiers » row that opens the cards and folds them back (open state kept while
      scrolling); click a card to open the file — `packages/ui/src/components/message/MessageAttachments/`
- [x] **A document is sent WHOLE**, masked whole: no per-document cut; what does not fit the model
      is refused before masking (above). A turn sent under the FORMER 50,000-character cut still
      says « tronqué » on its card and « Seuls les 50 000 premiers caractères de X ont été envoyés
      au modèle » — `packages/ui/src/send/foldPayload.ts`, `packages/ui/src/components/message/MessageAttachments/`
- [x] **What the documents weigh**: when the conversation's documents take half or more of the
      chosen model's window, a warning above the composer gives the share (« environ 80 % de la
      fenêtre de GPT-4o »), says each question re-sends them (true across a restart: each turn's
      model payload is kept in the encrypted local database), and suggests a larger-window model
      or a new conversation; silent in Auto mode or for an unknown window. Nothing about the send
      changes — `packages/ui/src/pages/ChatWorkspace/DocumentWeightNotice.tsx`
- [x] When a long conversation stops sending its oldest turns, the reply NAMES the documents
      those turns carried (« contrat.pdf n'est plus visible par le modèle »), and the note
      survives a reload — `packages/ui/src/components/message/MessageNotices.tsx`

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
