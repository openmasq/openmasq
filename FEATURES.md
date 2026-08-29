# The master file

**What the app does, what it gives you, where it is, and how you reach it.** One entry per
feature: what it makes possible, what it changes for the person using it, what it is worth
— then the exact list of the gestures available.

> **Hard rule (root, rule 13).** This file is in step with reality, always. A feature
> shipped without its line here is a feature nobody finds; a line that outlives its code is
> worse — it promises what no longer exists. **Enforced by `pnpm check:features`** (CI): it
> re-reads the lists the product already single-sources (sections, tabs, settings, screens,
> modals), demands that each be named here, checks that every cited path exists and that
> the counters are the real ones. What the gate can NOT do: tell that a sentence has aged.
> Hence the checklists — gestures redone by hand, not intentions.

**How to read an entry.** `**Access**:` is the literal path from the open app; it is quoted
in the app's own words, which are French. **What it makes possible** describes the
capability, **What it gives you** the change on the user's side, **What it is worth** the
trade-off — including what it costs when it costs. The checklist enumerates the gestures;
an unchecked box is something the app does **not do yet**, not a bug.

**A build with NO backend is the repository's DEFAULT.** No service address has a committed
value: what the build receives decides what EXISTS. Without them — accounts, billing, sync
and devices, organizations and shares (the inbox, "share" on the vault and the skills),
"Votre avis", included models, release notes, auto-update and the environment switch,
analytics — **none of it appears**: no tab, no ⌘K entry, no card, no switch, and the
onboarding no longer offers a subscription. Everything else (your own keys, local models,
CLI subscriptions, redaction, documents, connectors, sandbox) works as it is. Deploying
your own stack: `SELF_HOSTING.md`.

**Scope.** The product = the desktop app (Electron). The web preview mounts the same UI with
fewer capabilities — flagged 🌐 (preview) where it differs; 📱 marks the screens of the
mobile shell in `packages/ui` (a variant built outside this repository).

**Three surfaces are governable remotely** — **Bibliothèque** (§ 4), **Compétences** (§ 5)
and **Mémoire** (§ 6): a flag removes their screen, their navigation entry, their ⌘K result
and their deep link. ⚠️ Closing an access closes a DOOR, **not the feature**: Mémoire keeps
riding along with sends and keeps taking notes, Bibliothèque keeps receiving files; only
Compétences also stop being usable (the "/" palette, pins, the model's own suggestion).
Network unreachable ⇒ the app keeps the doors as it last knew them, never closed —
`packages/ui/src/state/featureAccess.ts`.

**Verified counters** (recomputed by the gate on every run) —
<!-- n:sections -->5 sections · <!-- n:onglets-reglages -->11 settings tabs ·
<!-- n:ecrans -->8 screens · <!-- n:categories-redaction -->17 redaction categories.
The number of connectors is NOT stated here: the catalogue is made of five families
(`packages/catalog/src/mcp/connectors/`) and a hand-written total would be unverifiable —
exactly what this file is not allowed to contain.
---

## 1. The promise: redaction and restitution

This is the product. Everything else serves these three moments: values are masked before
the send, the model only ever sees the masked version, and the reply comes back with your
real values put back in place.

### Redaction on send
**Access**: automatic, on every send. Visible in the send button (« Redaction » →
« Redacted »), in the composer's highlights, and in the « N à redact » pill.

**What it makes possible.** Writing to a model with your real information — the client's
name, their IBAN, the site address, the medical file — without any of those values leaving
the machine. The app spots them (deterministic rules, checksums, shape detectors, then a
language model running **on your device** for the names, companies and places that no shape
can reveal), replaces them with substitutes of the same nature, sends the masked version,
and restores your values in the reply through the conversation's vault.

**What it gives you.** The question asked before every copy-paste — "can I put this into a
chatbot?" — disappears. You write the way you speak. It is also what makes usable the
documents one simply did not paste: a contract, a payslip, a medical report, a CRM export.

**What it is worth.** Professional use with no grey area: personal data does not leave the
device, so there is nothing to negotiate with an internal policy, nothing to justify to a
DPO, nothing to hope for from a provider's retention policy. And the quality of the answer
is preserved: a fake name is still a name, a fake IBAN passes its own mod-97, a fake city is
a real city — the model reasons correctly, on values that are not yours.

- [x] Deterministic detection (rules, checksums, shapes) — `packages/redact/src/engine/`
- [x] Semantic NER detection **on the device**, with no network — `packages/redact/src/local/`
- [x] Detection by a remote model (the "cloud" engine), for those without the local horsepower — `packages/redact/src/remote/`
- [x] **Believable** substitutes of the same nature (default) — `packages/redact/src/model/pseudonymize/`
- [x] **Marker** substitutes `[PERSON1]` (plain mode, opt-in) — `packages/redact/src/model/pseudonymize/allocateTokens.ts`
- [x] Restitution of the reply through the conversation's vault — `packages/redact/src/engine/vault.ts`
- [x] **Failure = the send is blocked**, never a silent fallback to less protection
- [x] One substitute per value, across the whole conversation (cases, fragments, tool echoes)
- [x] A secret salt per conversation: the same name does not yield the same fake elsewhere
- [x] Public figures and countries are not masked (otherwise the model answers about nobody)
- [ ] Restoring a marker the model translated (« [PERSONNE1] ») — not covered

### The 17 categories, and the protection level
**Access**: Réglages → **Confidentialité** → « **Niveau de protection** » (Standard /
Strict / Sur mesure), then the expandable matrix.
Also per conversation: ⋯ in the chat header → « Redaction · N protégés ».
And **from the composer**: the "level" button in the action row opens the same three levels,
right where one notices that a send masks too much — or too little. Its glyph keeps three
strokes and bolds as many as the current level (1 · 2 · 3); each card its own. One click sets
the level on THAT CONVERSATION — the global default is changed where it is weighed (Réglages,
or the « Par défaut » tab of the ⋯ menu); with no conversation created yet, the default is what
receives it — `packages/ui/src/pages/ChatWorkspace/ComposerRedactMenu.tsx`

**What it makes possible.** Deciding *what* is protected, by category: names, dates of
birth, e-mails, phones, addresses, places, companies, cards, IBANs, national and company
identifiers, IPs, numbers, file paths, health, handles, URLs, keys and secrets. Three named
levels make the choice for you; « Sur mesure » is the hand-set one. The scope is global, or
**specific to a conversation**.

**What it gives you.** The slider between discretion and answer quality is yours, and it
moves where it must: one can work strictly on an HR file and leave city names in the clear
on a logistics question, without changing a global setting or an account.

**What it is worth.** Protection stays credible because no preset lowers it — there is no
"fast mode" that quietly disables categories. And inside an organization, a category
mandated by the admin can be neither disabled nor revealed by a member: the policy actually
holds, it is not merely displayed.

- [x] Three named levels, « Sur mesure » being the hand-set one — `packages/ui/src/privacy/privacyLevel.ts`
- [x] **Global** scope (Réglages) or **per conversation** (the chat modal)
- [x] No preset LOWERS the protection
- [x] A category mandated by the organization can be neither disabled nor revealed
- [x] The composer's preview obeys the same rules as the send
- [x] Reveal a detected value one at a time (and re-mask it)
- [x] An uncertain detection is marked « **à vérifier** » (dotted) in the preview — masked by default, kept in the clear with one click if it is a false positive — `packages/ui/src/pages/ChatWorkspace/composerDetection.ts`
- [x] Notoriety follows the level: Standard/Renforcé spare big brands, MCP integrations and public figures; **Strict** masks them too — `packages/ui/src/privacy/privacyLevel.ts`
- [x] Every category and every level also state what masking can DISTORT (not only what it covers) — `packages/ui/src/components/PrivacyLevelPicker.tsx`

### Seeing what the model saw
**Access**: under a reply → « Voir ce que le modèle a vu » (`TransparencyModal`), or
Réglages → Confidentialité → « **Transparence · journal technique** ».

**What it makes possible.** Comparing, message by message, what you wrote and what actually
left. The comparison is not a copy taken aside: it replays the same substitution as the
send, on the same data — so it cannot flatter the result. Next to it, a global filterable
audit log, and a technical debug log kept permanently on the device and preserved from one
session to the next (the setting governs only its visibility in the ⋯ menu and the console
trace).

**What it gives you.** The ability to **check** instead of believing. That is especially
useful in the first week, when the product is tested with a sceptical eye — and on the day
someone asks for an account of what left the machine.

**What it is worth.** An unverifiable confidentiality promise is worth nothing. This one
opens in one click from any reply.

- [x] Message-by-message comparison, your text ⇄ the text that left — `packages/ui/src/privacy/transparency.ts`
- [x] Recomputed on demand from the vault (no separate copy that could lie)
- [x] **« Comprendre mon redaction »** — a small container under the first replies opens the guide's redaction chapter (public figures left in the clear, a zero counter on a conversation with no personal data, Coffre for code names); « Fermer pour toujours » (`Settings.redactionIntroSeen`), the chapter staying in Aide; never stacked with the transparency card — `packages/ui/src/privacy/redactionIntro.ts`, `packages/ui/src/pages/ChatWorkspace/RedactionIntroCard.tsx`
- [x] Global audit log, filterable and searchable — Réglages → **Journal** (the per-conversation log, an impoverished view of the same vault, was removed)
- [x] Technical **debug log**, turn by turn, **persistent** (⋯ → « Journal de débogage », visible when « Journal technique détaillé » is on) — `packages/ui/src/containers/modals/DebugLogModal/`
- [x] Copy an exchange **without** the mapping table (the text that left, alone)
- [x] **Send the log to the developers** — the debug log opens « Votre avis » pre-filled, the mapping-free export attached and re-readable before sending — `packages/ui/src/avis/avis.ts` (`debugJournalDraft`)
- [x] **Report from the reply itself** — a feedback icon in the action bar (next to Copy / Regenerate / Fork) opens « Votre avis » with this conversation's log already attached; it catches the eye once per reply, then goes quiet — `packages/ui/src/avis/avis.ts` (`messageFeedbackDraft`)
- [x] On a report that **carries the log**, the mood becomes **optional** — the logs are the signal, and demanding a note before sending cost exactly the report one wants most (the label says so, the server applies the same rule) — `packages/ui/src/avis/avis.ts` (`canSendFeedback`)

### How protected values are displayed
**Access**: Réglages → Confidentialité → two neighbouring settings:
« **Afficher des jetons plutôt que des pseudonymes** » and « **Le modèle ne voit que des jetons** ».

**What it makes possible.** Choosing the FORM of the masking, on two distinct planes. On
screen: reading "[PERSON1]" rather than a fake name, to tell at a glance what is protected.
On the wire: sending the model markers only, so that nothing of the person remains — not
even the plausibility.

**What it gives you.** The first setting removes the reading doubt ("that name — is it real
or not?"). The second answers a harder need: a fake name is still a name, hence a plausible
gender and origin; a fake postcode is still a region. For someone who wants **nothing** to
transit, it is the only mode that holds.

**What it is worth.** The first is free. The second has a price, and it is measured: fakes
preserve 6 signals out of 10 that everyday answers depend on (courtesy and agreement, a city
for a closing formula, an IBAN's country, a number's class), markers 2 out of 10. So the
mode is an informed choice, not a hidden default — and it is pinned to the conversation so
that switching does not mix the two vocabularies.

- [x] The first changes what **you** see (the « Redacted » views of documents)
- [x] The second changes what **leaves** — and is paid for in answer quality (measured)
- [x] The send mode is pinned to the conversation, not re-read midway
- [ ] Switching an already-started conversation to the other mode — deliberately impossible

---

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

- [x] Composer with live highlighting of what will be redacted — `packages/ui/src/pages/ChatWorkspace/Composer.tsx`
- [x] « Nouvelle conversation » **creates** nothing: it shows the welcome screen, and the
      conversation is born on the **first send** — no more empty « Nouvelle conversation »
      rows in the list after a click with no follow-up — `packages/ui/src/workspace/layout/ops.ts` (`showWelcome`)
- [x] Sending is blocked while the analysis runs (the button says so)
- [x] Streamed reply, stoppable (« Stop »)
- [x] The model's reasoning shown during the wait, when the model produces one (DeepSeek, Qwen, Nemotron, Claude, Gemini, OpenRouter…) — un-redacted like the reply; otherwise the loader alone, nothing invented — `packages/ui/src/state/reasoningRelay.ts`
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
- [x] Conversation tabs + a splittable workspace — `packages/ui/src/workspace/`
- [x] Drafts kept per conversation, **in memory only**
- [x] Full-screen editor for a long draft, with a Preview tab
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
      `packages/ui/src/state/accessNotice.test.ts`
- [x] The key window SAYS a key is already stored (without ever reading it back: it lives
      encrypted on the privileged side), offers to **replace** it, and to **remove** it
      — `packages/ui/src/containers/modals/ApiKeyModal.tsx`
- [x] **Hosting jurisdiction** flag per model
- [x] Default model for new conversations
- [x] « **Modèle sur votre ordinateur** » (Ollama / LM Studio) — Réglages → Modèles
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
- [x] OpenRouter catalogue fetched live
- [x] The model that answered stays stamped on the reply
- [ ] **« Auto » mode** — REMOVED from the picker: neither view offers it any more. The
      router stays in place and serves the conversations already pinned to it (the model is
      chosen at each send according to the task, only among what the account can actually
      send with; a « choisi automatiquement · via votre abonnement » caption on each routed
      reply) — `packages/ui/src/send/autoRoute.test.ts`,
      `packages/ui/src/send/autoTaskIntent.test.ts`
- [x] An unreachable model explains what it takes to reach it — `packages/ui/src/containers/modals/ModelAccessModal.tsx`
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
**Access**: the composer's paperclip, or **drag and drop** a file or a folder onto the
conversation.

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
- [x] Sending a document as **redacted images** to a multimodal model
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

- [x] « Redact » a chosen value, with its type — `packages/ui/src/components/SelectionMenu.tsx`
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

---

## 3. Tools, connectors, browser

The moment the assistant stops answering and starts **acting** — and where the guardrails
stop being theoretical.

### Connecteurs
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
- [x] « Ajouter un connecteur », unverified, in its own section
- [x] See the tools a connector exposes — `packages/ui/src/containers/modals/McpToolsModal.tsx`
- [x] Choice of access mode when the server offers two — `packages/ui/src/containers/modals/McpAuthChoiceModal.tsx`
- [x] Connectors from your other devices are offered for connection
- [x] Connect without leaving the screen: the modal opens on top, from any mention of a
      connector — `packages/ui/src/pages/Settings/mcp/ConnectorModalHost.test.tsx`
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
- [x] **Add a folder** from that same rail (native picker; the grants already in place are
      kept)
- [x] **« Demander »** on hovering a folder (or clicking a cloud entry): a fresh
      conversation carrying the target as a **tag** — folder/file and its service or path, a
      chip on the composer then on the message — which the model reads with the connector's
      tools; nothing is attached by default
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
**Access**: the globe in the right rail of a conversation · Réglages → **Navigateur**.

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

---

## 4. Bibliothèque

### Your files, already masked
**Access**: the **Bibliothèque** section.

**What it makes possible.** Finding again any file that went through a conversation — image,
PDF, document — already masked, filterable by type, with its redacted version and the list of
conversations using it. Re-attaching it elsewhere in one click. And, if the Filesystem
connector is plugged in, browsing the granted folders right here.

**What it gives you.** No more hunting for "which conversation did I put that contract in".
And a re-attached file starts from its extraction already done: no new OCR, so no wait.

**What it is worth.** This is the only place that answers "where did that data go?" — useful
day to day, indispensable on the day of an audit. The redacted version kept beside the
original makes it possible to share a document without reworking it.

- [x] Every file of a conversation lands here automatically — `packages/ui/src/pages/Library/`
- [x] Filters by type; search
- [x] **Grid or list** display, remembered per screen — `packages/ui/src/components/ViewModeToggle.tsx`
- [x] Opens in the shared side panel — **one view only, the redacted one** (+ « Conversations »)
- [x] "Which conversations use this file"
- [x] Re-attach a file to a new conversation (without re-OCR)
- [ ] Uploading a file straight into Bibliothèque (it goes through a conversation)

---

## 5. Compétences

Stop rewriting the same thing. **One single list**: a skill is a reusable instruction, and
one that names connectors puts them to work — that is the "Routines" category, what the app
used to call a "workflow" when it was a second screen.

### Compétences
**Access**: the **Compétences** section · `/` in the composer.

**What it makes possible.** Saving a good instruction — a standard reply, a report format, a
translation brief, a proofreading style — filing it by category, and inserting it into any
conversation in one click or with `/`.

**What it gives you.** The quality of an answer depends mostly on the quality of the request.
An instruction refined three times and then saved is reused as-is, without rewriting it or
digging it out of an old thread.

**What it is worth.** The gap between a good and a bad use of a model comes from there, and
it compounds: your library of instructions becomes your way of working. The prompt leaves
redacted like everything else — a saved template often contains the real example pasted while
it was being written.

- [x] Create, edit, file by category — screen `packages/ui/src/pages/Competences/`, logic `packages/ui/src/competences/`
- [x] **Skills shared inside the organization** — the grid groups by scope (**Organisation** and **Équipe** sections above your cards, badged Perso): skills shared with you are used in one click. Each personal card carries **« Partager »** on hover → the same "with whom?" modal, with a **redacted preview** of the shared text ("exactly what others will see"); requests and decisions on the **« Demandes » bell**, an accepted person-share **adopts a copy** — sections `packages/ui/src/pages/Competences/parts/OrgCompetencesBlock.tsx`, modal + bell `packages/ui/src/containers/orgShares/`, channel `packages/sync/src/orgScope/`
- [x] **Asking the assistant to write one**: "create me a skill for…" and it answers with a
      card — name, category, expandable prompt — that an **Ajouter** button files into the
      list. It is classified as a **Routine** when it drives connectors (which then show on
      the card). Nothing is added without the click, and a block still being written offers
      no button — `packages/ui/src/components/markdown/blocks/SkillCard.tsx`, block reading
      `packages/ui/src/suggestions/proposedSkill.ts`
- [ ] **Import from Claude** — DISABLED: the `claudeSkills` slot is not wired
      (`apps/desktop/src/renderer/src/main.tsx`), so no button shows and nothing reads the
      disk. The code remains, one line switches it back on. What it would do, once rendered:
      the app reads the skills Claude Code keeps on this device (`~/.claude/skills`, and the
      `.claude/skills` of folders already granted to the Fichiers connector) — **or one
      DROPS** a folder, a `SKILL.md` or the `.zip` from claude.ai, which grants no path (the
      drop provides the bytes), `packages/ui/src/import/dropSkills.test.ts`. The screen shows
      what it found, lets each be filed as a skill or a routine, and flags those relying on
      companion files — which will not be imported. A name already taken never overwrites:
      "(2)". `packages/ui/src/containers/modals/ImportSkillsModal.tsx`,
      `packages/ui/src/import/claudeSkills.test.ts`
- [x] Starter templates offered (nothing is installed without you)
- [x] **Grid or list** display, remembered per screen — `packages/ui/src/components/ViewModeToggle.tsx`
- [x] One-click insertion; the chip shows the prompt on hover
- [x] The prompt leaves redacted like everything else
- [x] Undo a deletion

#### Routines — a skill that puts your connectors to work

**What it makes possible.** "Gather my important e-mails from this week, cross-check with the
calendar, prepare a summary." Written once, replayed whenever you want. It is a skill like
any other: its connectors are chosen in an **expandable panel** of the same creation window,
and it files itself under "Routines".

**What it gives you.** The routines redone every Monday stop being redone. And there are no
longer two places nor two windows to know for the same thing.

**What it is worth.** Attached connectors **guide** the model without **granting** it
anything: the rights stay the ones you gave in Réglages. So a routine cannot quietly widen an
access.

- [x] Connectors chosen in the creation window (guidance, not an access right) —
      `packages/ui/src/competences/launch.ts`, `packages/ui/src/pages/Competences/parts/ServerPicker.tsx`
- [x] The scope SURVIVES into the next turn: a routine that asks a clarifying question keeps
      its connectors for the answer — `packages/ui/src/competences/launch.test.ts`
- [x] One intent per send
- [x] Starter templates, sorted by what is already connected
- [x] **Your old workflows are carried over automatically**, with their connectors and their
      history — `packages/ui/src/competences/migrate.test.ts`

---

## 6. Mémoire

### What the app remembers from one time to the next
**Access**: the **Mémoire** section · « retiens que… » (12 languages) inside a conversation ·
a text selection → **Retenir** · `/` → « Retenir en mémoire ».

**What it makes possible.** Building, across conversations, one card per entity (this
client, this project, this constraint) and a preferences profile. Two routes: silent
extraction (which can be turned off) and the explicit request, which always works. On
desktop, a graph groups and merges nearby cards by itself, computed on the device; a list
view with search finds what the graph makes you understand.

**What it gives you.** No longer re-explaining the context in each new conversation. That is
the difference between a tool one keeps re-priming and a tool that knows you — and that says
honestly when it did NOT recognise someone, instead of implying it knows everything.

**What it is worth.** It is also the product's most delicate feature where confidentiality is
concerned, and it is treated as such: memory is stored **in the clear locally** — because
substitutes are no longer stable from one conversation to the next — and **re-redacted on
every injection**, with the current conversation's vault. Two entities with disjoint names
never merge (a proposed merge stays to be confirmed), and a real failure is stated ("try
again") instead of being swallowed: a memory that claims to have remembered without doing so
is worse than no memory. Nothing is erased silently either: an update keeps the previous
version, restorable.

- [x] Cards per entity + a preferences profile — screen `packages/ui/src/pages/Memory/`, CRUD `packages/ui/src/state/useMemory.ts`
- [x] **Silent** extraction (can be turned off, `MemorySection.tsx`) and **explicit** extraction (always on, 12 languages) — `packages/ui/src/memory/extractExplicit.ts`
- [x] Graph (drag/zoom/reframe) and list view with search, as you prefer — `packages/ui/src/pages/Memory/MemoryGraph.tsx`, `MemoryList.tsx`
- [x] Selecting a node **brings the view closer** to its neighbourhood — labels readable — and deselecting widens it again — `packages/ui/src/pages/Memory/graphFrame.test.ts`
- [x] Grouping + merge suggestions between nearby cards, computed on the device — `packages/ui/src/memory/cluster.ts`, `dedupe.ts`
- [x] « Mémoire utilisée » under a sent message, and a non-recall explained when it could surprise — `packages/ui/src/components/message/MemoryCaptions.tsx`
- [x] A card **updates** (never stacks); replaced versions stay visible and **restorable** — `packages/ui/src/memory/compaction.ts`
- [x] A « À revoir · N » box: auto cards + proposed duplicates, with inline **Confirmer**/Delete — emptying it is the task — `packages/ui/src/pages/Memory/useMemoryReview.ts`
- [x] "Recalled in N conversations" + a surprising non-recall explained, on the card — `packages/ui/src/memory/usage.ts`
- [x] Deleting a card can be undone for a few seconds (an « Annuler » toast, identical restoration)
- [x] The category legend filters the page; the list can be grouped by category; the profile is editable by clicking its text
- [x] Turn memory off for a conversation (both ways) — ⋯ → Redaction → switch — `packages/ui/src/containers/modals/redaction/RedactionRulesModal.tsx`
- [x] `memory_search` as a tool for the model, with a **semantic** tier on desktop — `packages/ui/src/memory/select.ts`
- [x] Stored in the clear **locally**, re-redacted on every injection
- [x] A real failure is stated ("try again"), never hidden
- [x] Two entities with disjoint names never merge
- [x] A discreet dot on the Mémoire icon when something was noted elsewhere
- [x] Edit or delete a card by hand

---

## 7. Coffre

### Your always-masked terms
**Access**: the **Coffre** section.

**What it makes possible.** Declaring once and for all the terms that must be masked in
**every** exchange: a project's code name, an account number, an internal identifier, a
client's name — everything no generic detector can guess is sensitive.

**What it gives you.** Certainty about what actually worries you. Automatic detection covers
known shapes; the Coffre covers **your** vocabulary, the one that only means something where
you work.

**What it is worth.** The contract is "always masked", so it holds inside a tool result too —
a Coffre term appearing in an e-mail fetched by a connector is masked as if it came from you.
Without that, the promise would have a hole exactly where nobody looks.

- [x] A dictionary of values masked on **every** send, whatever the conversation — screen `packages/ui/src/pages/Vault/`, logic `packages/ui/src/send/coffre.ts`
- [x] Occurrence count computed on the real vaults
- [x] Holds inside a tool result too (not only in what you type)
- [x] Add a term from a selection inside a conversation
- [x] **Terms shared inside the organization** — the Coffre list stays ONE, badged by scope (Perso / Équipe / Orga): terms shared with you fold into it read-only, masked like yours. Each personal row carries **« Partager »** → the "with whom?" modal (the whole organization, your team, or one person — each target states **who approves**: an administrator for org/team, the recipient themselves for a person); requests arrive on the right panel's **« Demandes » bell**, and accepting a person-share **adopts a copy** into your list; end-to-end encrypted to the audience only (desktop) — badge/scopes `packages/ui/src/orgShares/scopes.ts`, modal + bell `packages/ui/src/containers/orgShares/`, merge at send time `combinedCoffre` (`packages/ui/src/send/coffre.ts`), channel `packages/sync/src/orgScope/`
- [ ] Bulk import of a list of terms

---

## 8. Réglages

**Access**: the gear in the rail · ⌘K, which indexes the settings themselves. Four visible
tabs, the rest behind « Avancé » — because a setting one is looking for is found by
searching, not by an eleven-entry list.

### Compte
**Access**: Réglages → **Compte**.

**What it makes possible.** The device's identity — and the **Organisation** card: on a
company account it shows yours (name, role, headcount) and leads to the Organisation tab; on
a solo account it offers to **create one**, in the web app — the appearance (light or dark),
importing your existing conversations, the billing-mode choice, consent to anonymous
statistics, and link previews.

**What it gives you.** The import is the gesture that makes changing tools possible: your
ChatGPT or Claude history arrives **redacted on import**, hence reusable here without
starting from scratch. Billing leaves you the choice between your own key (you pay the
provider directly — the only route for OpenAI, Anthropic, Google, Mistral and DeepSeek) and
the included credits (nothing to configure: Scaleway + a selection of OpenRouter).

**What it is worth.** The two "discreet" settings are treated as decisions, not as
checkboxes: statistics are an explicit consent and carry counters only, never content; link
previews are **off by default** because previewing a link means making an outgoing request —
hence revealing that you received it.

- [x] Device identity, sign-out
- [x] « **Mode sombre** » (the background; the indigo accent is no longer an option — an inherited green theme is translated at load, `packages/ui/src/state/storePersistence.ts`)
- [x] « **Importer des conversations** » (official ChatGPT / Claude exports, redacted on import)
- [x] « **Facturation des messages** » : your key, or the included credits
- [x] « **Prévenir quand une réponse arrive** »: a system notification, **only** if the
      thread is not in front of you (another window, or another conversation); the click
      brings the window to the front and opens the right thread. The banner carries
      **neither the message nor the title** of the conversation — it appears above
      everything, sometimes on a locked screen. On by default, can be turned off here —
      `packages/ui/src/state/replyNotice.test.ts`
- [x] « **Statistiques d'usage anonymes** » (explicit consent, counters only)
- [x] « **Aperçus de liens** » (opt-in, one outgoing request per link)

### Confidentialité, Modèles, Connecteurs, Navigateur
**Access**: Réglages → the matching tab. The detail of each is in sections 1 to 3.

**What it makes possible.** The four tabs that govern what the app protects, what it answers
with, what it reaches, and what it may do on its own.

**What it gives you.** Each tab is titled, described and **searchable by construction**: the
same single source feeds the rail's label, the page header and the ⌘K palette row. So a
setting cannot exist without being findable.

**What it is worth.** That is what makes it acceptable to fold seven tabs behind « Avancé »:
nothing becomes unreachable, only less cluttered.

- [x] Each tab is titled and searchable by construction — `packages/ui/src/pages/Settings/settingsIndex.ts`
- [x] The settings themselves are indexed in ⌘K, not only the tabs

### Journal, Usage
**Access**: Réglages → **Journal** (the redaction audit, then « **Ce qui est sorti de la
machine** ») · Réglages → **Usage**.

**What it makes possible.** Going back through the history of what was masked, filterable and
searchable; seeing the list of **addresses the app actually contacted** and those it refused;
and reading your consumption, per model and per conversation, with an estimated cost.

**What it gives you.** Answering "what left this machine, and what did it cost me" without
opening a spreadsheet — and, now, "who has this app talked to", the question asked on the day
of an audit, which a redaction log alone did not answer.

**What it is worth.** The figures are qualified rather than asserted: what is **estimated**
(because the provider did not return the counters, or because the reply was interrupted) is
flagged as such, and "my key" is separated from "subscription". A single smooth total would
have invited a precision it does not have. The network log records **only the site's name** —
never the page nor what was requested, because a full address often carries a token — and it
is read-only: the app writes it, the interface can neither invent nor erase it.

- [x] Redaction history, filterable and searchable, **grouped by conversation**: one card per
      thread, with its title, its number of values and its date. That is the shape of the
      vault itself — the salt being per conversation, the same real value carries a different
      stand-in there, which a flat list read as an inconsistency —
      `packages/ui/src/pages/Settings/privacy/auditRows.ts`
- [x] The **date lives on the group header**, never on the row: the vault does not timestamp
      its entries, and a date per value promised a precision no data carries
- [x] **Network log**: contacted and refused addresses, by origin (browser, connector, link
      preview…), searchable — `packages/ui/src/pages/Settings/privacy/egressJournal.ts`
- [x] The two halves are **two views of a selector**, not a stack: the redaction table loads
      endlessly by pages, so the network log placed underneath was out of scrolling reach —
      `packages/ui/src/pages/Settings/privacy/AuditLogTab.tsx`
- [x] The network log keeps the **site name only** (never the page nor the request)
- [x] Written by the privileged process, read-only for the interface — `apps/desktop/src/main/net/egressJournal.ts`
- [x] Consumption per model and per conversation, estimated cost
- [x] Separation of "my key" / "subscription", and what is estimated rather than measured
- [x] The histograms have no y-axis: the **maximum is written** under the title, and
      **hovering a column** (or reaching it by keyboard) gives the day and its value, model by
      model — `packages/ui/src/pages/Settings/billing/ModelTimeline.tsx`

### Vos appareils
**Access**: Réglages → **Vos appareils** → « **Appareils connectés** ».

**What it makes possible.** Finding your conversations, skills and memory again on another
device, through end-to-end encrypted sync behind a secret phrase only you hold. A device can
be revoked.

**What it gives you.** The product stops being tied to one machine, without that implying
handing its content to a server.

**What it is worth.** This is the point where many tools trade confidentiality for
convenience. Here the server carries ciphertext only: sync cannot become the door that
redaction closed.

- [x] End-to-end encrypted sync between your devices — `packages/sync/`
- [x] Secret phrase; revoking a device
- [x] Scope: conversations, skills (routines included), memory
- [x] Connector credentials do NOT sync (each device redoes its OAuth)
- [x] **The status line** — Réglages → Synchronisation shows the RESOLVED environment (staging/production, never inferred from the channel) and the last exchange (succeeded X min ago / failed + reason): sync is best-effort, and this line is what stops an outage from being invisible — `packages/ui/src/pages/Settings/syncStatusLine.ts`, `apps/desktop/src/renderer/src/sync/status.ts`

### Organisation
**Access**: Réglages → **Organisation** (if the account belongs to an organization).

**What it makes possible.** Attaching accounts to an organization, with roles, a shared
credit pool, an audit log, and above all a **mandated frame** the member cannot loosen:
redaction categories they can neither disable nor reveal, and a **list of permitted models
and connectors that starts from zero** — everything is closed until administration opens it.
On a managed account, **personal API keys are disabled**: the organization provides the
models, so there exists no outgoing route it does not govern. A separate admin console
manages all of this.

**What it gives you.** On the admin's side: the guarantee that the policy really applies, on
every workstation. On the member's side: nothing to configure to be compliant.

**What it is worth.** That is what allows the tool to be deployed without turning it into a
risk — a policy that depends on everyone's goodwill is not a policy.

- [x] Roles, members, mandated redaction categories
- [x] **Models and connectors on an ALLOW-list**: a new organization starts entirely closed,
      and a model added to the catalogue later is NOT opened by default
- [x] **Personal API keys disabled on a managed account** — refused both on write AND on
      injection by the privileged process — `apps/desktop/src/main/store/keysPolicy.ts`
- [x] The refusal of a non-permitted model is **re-checked server-side** by the gateway, the
      only point that depends on no workstation — `apps/gateway/src/features/inference/shared/orgModelPolicy.ts`
- [x] Blocked connectors **and** a mandated confirmation level as a floor — enforced by the
      privileged process, not only by the interface
- [x] Separate admin console — `apps/web/`
- [x] Organization-side audit log — `apps/backend/`
- [x] Shared credit pool
- [x] **Subscription manager** in the console (plan, amount actually charged, cancellation) —
      `apps/web/components/admin/subscription/`
- [x] **The subscription follows the headcount**: an ACCEPTED invitation adds a seat billed
      pro rata, a departure removes it; a pending invitation costs nothing
- [x] The amount displayed is the one the provider charges, never a price reconstructed from
      the catalogue — `apps/backend/src/features/subscriptions/seatBilling.test.ts`
- [x] A gap between active members and billed seats is **shown**, with a gesture to close it,
      never swallowed silently

### Paiement
**Access**: Réglages → **Paiement**.

**What it makes possible.** A subscription with included credits, the consumption history,
and the possibility of paying nothing at all — by plugging in your own keys or staying on the
free models.

**What it gives you.** Access to the big models without opening an account at every provider,
nor managing five billings.

**What it is worth.** A send the credits cannot fund is refused **before** it leaves: an
answer is never served to be billed afterwards. The rule protects the user as much as the
publisher.

- [x] Subscription, included credits, history — `packages/credits/`
- [x] A free model stays usable without a subscription
- [x] A send that cannot be funded is refused **before** it leaves
- [x] The "credits exhausted" refusal always offers a **gesture**: subscription + key for a
      free account, « Renseigner la clé » for an organization member or an account with no
      billing — `packages/ui/src/send/preflight.test.ts`

### Versions
**Access**: Réglages → **Versions**.

**What it makes possible.** Choosing your release channel, reading the update notes — and
going back. The update itself is not a setting: it is **always** automatic.

**What it gives you.** Knowing what changed in a tool that touches your data, and not being
stuck with a version that breaks your use.

**What it is worth.** Going back is what makes automatic updating acceptable: without it,
"always up to date" is an imposed risk.

- [x] Release channel, update notes — `apps/desktop/src/main/updates/`
- [x] **A downloaded version announces itself IN the app**, with what it brings (the
      published note) and a "Restart now" — no more system dialog, in English and mute about
      the content. Once per version, never before the version is there, never on top of
      sign-in; dismissed, a button at the foot of the right rail reopens it while the update
      waits — `UpdateReadyModal`,
      `packages/ui/src/containers/shell/hooks/useUpdateReady.test.tsx`
- [x] **Updating is always automatic — no setting turns it off.** Checking and downloading
      happen on their own; installation waits for a click on "Install and restart", the next
      close of the app — or a moment of inattention (next bullet). The switch that existed
      only served to stay on an old version, hence to keep defects already fixed —
      `apps/desktop/src/main/updates/poll.test.ts`
- [x] **A ready version installs ITSELF when nobody is looking**: app in prolonged background
      (≥ 30 min) or user away (≥ 10 min idle), and only if nothing is in flight — no send
      running, no unsent draft (the renderer answers a probe; its silence counts as "busy", so
      never a random restart) — `apps/desktop/src/main/updates/autoInstall.test.ts`,
      `packages/ui/src/state/effects/useUpdateQuiescence.test.ts`
- [x] **The list of published versions and what each brought** (the same content as the
      « Nouveautés » tab of the help), including where there is no build to install — the
      build history itself only shows on a pre-release version or a privileged device —
      `packages/ui/src/pages/Settings/updates/parts/PublishedNotes.tsx`,
      `packages/ui/src/pages/Settings/updates/UpdatesSection.test.tsx`
- [x] A check at launch **and every 15 min** while the app stays open, so that a server-side
      withdrawal of a version does not wait for a restart —
      `apps/desktop/src/main/updates/poll.test.ts`
- [x] Going back to a previous version
- [x] « **Environnement** » — the card says whether the app talks to production or staging, and
      offers the switch to authorized accounts (beta access granted by the team) or to
      privileged devices; from staging, the way back to production is always offered. The
      decision is re-checked outside the UI on every request, and a refusal is shown as-is —
      `packages/ui/src/pages/Settings/updates/parts/EnvCard.tsx`,
      `packages/ui/src/pages/Settings/updates/parts/envView.test.ts`

---

## 9. The app's frame

### Navigation
**Access**: the left rail · ⌘K everywhere.

**What it makes possible.** Six sections plus Réglages, a shared side panel that survives a
change of section, and a ⌘K palette that reaches conversations, sections **and** settings.

**What it gives you.** An open document stays open when you move from the chat to
Bibliothèque. And anything is reached from the keyboard, without learning where it is filed.

**What it is worth.** The vocabulary of the five sections comes from a single source: the
rail's label, the tooltip, the page subtitle and the guide's paragraph are the same strings.
The app cannot describe itself in two ways — which, on a product where four names out of five
are its own (Coffre, Compétences, Mémoire), is the difference between a vocabulary and
jargon.

- [x] Six sections + Réglages — `packages/ui/src/help/sections.ts`
- [x] ⌘K palette: conversations, sections, settings — `packages/ui/src/containers/modals/SearchModal/`
- [x] Shared side panel, kept from one section to the next
- [x] Folding it: click the **active** tab again; closing it: the cross on its item. The
      right rail carries no panel command, and nothing hides the conversation
- [x] Right rail: browser tabs, **« Dossiers »** (granted folders as a tree + connected
      storage, only if there is something to browse), Aide and Avis —
      `packages/ui/src/containers/shell/RightRail.tsx`
- [x] 📱 Mobile replaces certain screens with its own — `packages/ui/src/containers/shell/mobile/`

### First launch
**Access**: on first launch, after signing in — on the account's **first** device only: an
already-established account (paying subscription, or organization member) signing in on a new
machine does not go through it again — `packages/ui/src/state/establishedAccount.ts`.

**What it makes possible.** Signing in by magic link or Google account, then seeing a
demonstration of redaction, choosing how to reach models — the built-in subscription or your
own key (OpenRouter, OpenAI, Anthropic…) — and tuning the categories right away, without
being forced to.

**What it gives you.** Understanding the product in thirty seconds, on an example that
actually runs rather than a screenshot — and plugging in your key in the first minute if you
have one.

**What it is worth.** The onboarding **shows**, and configures only what it is asked to: the
one choice offered (subscription or key) is optional — "Skip" leaves the free model already
active. It also defuses the two reflexes that would push someone to lower the protection
("it will mask public figures" — no; "a web search will look for a fake name" — no, it offers
to reveal first).

- [x] Sign-in by magic link or Google — `packages/ui/src/pages/Login/`
- [x] Redaction demonstration, replayable afterwards from **Aide** — `packages/ui/src/components/RedactionDemo/`
- [x] Choice between the built-in subscription ⇄ your own key (OpenRouter or another), optional — `packages/ui/src/pages/Onboarding/KeyChoice.tsx`
- [x] A tickable procedure to obtain the chosen provider's key + an alert on paste if the key does not have that provider's shape — `packages/ui/src/pages/Onboarding/KeySteps.tsx`
- [x] "Get a key for free" (OpenRouter) — OAuth, with no copy-paste; the key is born and stays in the main process — `apps/desktop/src/main/store/openrouterPkce.ts`
- [x] Fine-tuning the categories from the welcome, without being forced to
- [x] With the keyboard: focus enters the card and stays there, the rest of the app is inert — `packages/ui/src/hooks/useDialogFocus.ts`

### Help and feedback
**Access**: the foot of the right rail → « Aide » and « Envoyer un avis ».

**What it makes possible.** A guide explaining the five sections, a feedback form, and the
copyable detail of an error.

**What it gives you.** The help says what the app really does: it **renders** the app's own
strings rather than describing a second version of them. A guide describing an earlier
version is worse than no guide.

**What it is worth.** The copyable error detail turns "it did not work" into an actionable
report — and the feedback leaves with what **you** choose to attach, not with what the app
would have decided to collect.

- [x] A guide that **renders** the app's real strings — `packages/ui/src/containers/modals/GuideModal.tsx`
- [x] **A link to the extended help centre** (`help.<domain>`, branding.json) in the Aide
      header, hence visible from every chapter, leaving through the system browser —
      `packages/ui/src/help/links.ts`, `packages/ui/src/containers/modals/GuideModal.test.tsx`
- [x] The **« Nouveautés »** tab of Aide: the history of published versions (the one sent by
      e-mail), read in the app, most recent first — one note per version, and the tab does
      not exist where that source does not exist —
      `packages/ui/src/containers/modals/GuideReleases.tsx`,
      `packages/ui/src/containers/modals/GuideModal.test.tsx`
- [x] « Votre avis »: feedback, with what you choose to attach — `packages/ui/src/containers/modals/AvisModal.tsx`
- [x] **Technical context** attachable with one switch: version, channel, screen, system,
      model, protection level — six machine values, never a line of your conversations —
      `packages/ui/src/containers/shell/hooks/useAvis.ts`
- [x] On a **bug report**, the debug log is **attached by default** — a verbatim preview on
      screen, one gesture removes it (the collection is permanent, and a report without a log
      cost a round trip) — `packages/ui/src/containers/modals/AvisModal.test.tsx`
- [x] **A feedback icon under every reply** (the Copy / Regenerate / Fork bar): the
      conversation's log arrives already attached, the mood is no longer required — reporting
      no longer requires leaving the reply — `packages/ui/src/components/message/MessageBubble.tsx`
- [x] The detail of an error, copyable — `packages/ui/src/containers/modals/ErrorDetailModal.tsx`
- [x] A failed send says so **under the message**, in natural French — one message, one
      gesture, the ways out as BUTTONS: missing or refused key → enter the key; **provider
      account out of funds** ("Votre compte OpenAI n'a plus de crédits") → top up, without a
      single wasted retry; quota exhausted ("free" only if it is one) → the time it resumes;
      a simple burst → wait, with the duration quoted when it is known.
      `packages/ui/src/state/errors.test.ts`

---

## 10. What protects, under the hood

### The guarantees you do not click
**Access**: nothing to click — it is what holds while you click elsewhere.

**What it makes possible.** That the promises of the previous sections stay true even when
something goes wrong: a hostile web page, a compromised connector, a model inventing a tool
call, a flaw in the interface.

**What it gives you.** Nothing visible — and that is the point. The difference shows on the
day it counts.

**What it is worth.** Four principles carry the essentials. **What comes in is data, never an
order**: a page or an e-mail arrives labelled, and anything that looks like an instruction
addressed to the model is flagged rather than obeyed — flagged, not deleted, because a filter
that amputates a legitimate reply ends up disabled. **Everything is replayed on the
privileged side**: every barrier in the interface is a convenience, the real decision is
retaken where the interface cannot lie. **We permit, we do not forbid**: the lists are
allow-lists, so a novelty on a vendor's side is refused by default instead of being opened
silently. **We fail closed**: on an error, a timeout or an unknown, the default outcome is the
protective one — the send is blocked, the result masked, the tool refused.

- [x] Provider keys encrypted, **never** read back by the interface
- [x] Local database encrypted, per account (two accounts on one machine do not see each other)
- [x] Five processes outside the privileged one (browser, Python jail, files, NER, embeddings)
- [x] Bundled models and binaries, pinned by hash, never downloaded on the fly
- [x] An anti-SSRF guard on every outgoing request, **and logged** (Réglages → Journal)
- [x] Fetched content (web page, e-mail, document) arrives **labelled as data**, and content
      that tries to give the model instructions is flagged as such —
      `packages/ui/src/send/inboundScreen.ts`
- [x] Every barrier in the interface is **replayed** on the privileged side
- [x] No secret and no real PII in the logs
- [x] **Organization MCP policy enforced on the privileged side**: a non-permitted connector
      is refused at call time, at connection time, and even if it is re-added by hand through
      its address — `apps/desktop/src/main/mcp/orgPolicy.ts`
- [x] An **absent** policy (not received yet) and an **empty** policy (nothing opened) are not
      conflated: the first lets through, the second closes
- [x] The **confirmation level mandated by the organization** is a floor: a member can
      strengthen it, never loosen it — `packages/catalog/src/mcp/confirmationPolicy.ts`

---

## 11. Platforms

The same product, with what the platform allows. A missing capability **degrades silently** —
the screen does not show, the app does not break.

| | Desktop | 🌐 Web preview |
|---|---|---|
| Full redaction | ✅ | ✅ |
| NER on the device | ✅ | ❌ (remote engine) |
| Connectors | ✅ | ❌ |
| Driven browser | ✅ | ❌ |
| Python, PDF, OCR | ✅ | ❌ |
| Local folders | ✅ | ❌ |
| Sync | ✅ | ❌ |

---

## 12. Outside the app

What surrounds the product, and what it is for.

- **User documentation** (French, for the public), **online at `help.<domain>`** —
  maintained outside this repository
- **Organization admin console** (roles, policy, audit) — `apps/web/`
- **Inference gateway**: proxy, credit metering, and server-side redaction for those without
  the local horsepower — `apps/gateway/`
- **Remote API**: accounts, billing, sync, administration — `apps/backend/`
