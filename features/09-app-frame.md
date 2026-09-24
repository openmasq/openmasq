## 9. The app's frame

### Navigation
**Access**: the left rail · ⌘K everywhere.

**What it makes possible.** Five sections plus Réglages, a shared side panel that survives a
change of section, and a ⌘K palette that reaches conversations, sections **and** settings.

**What it gives you.** An open document stays open when you move from the chat to
Bibliothèque. And anything is reached from the keyboard, without learning where it is filed.

**What it is worth.** The vocabulary of the five sections comes from a single source: the
rail's label, the tooltip, the page subtitle and the guide's paragraph are the same strings.
The app cannot describe itself in two ways — which, on a product where four names out of five
are its own (Coffre, Compétences, Mémoire), is the difference between a vocabulary and
jargon.

- [x] Five sections + Réglages, iterated by the rail, the sidebar and the mobile bar from the same list, each with its one mark — `packages/ui/src/help/sections.ts`, `packages/ui/src/components/brand/icons/sections.tsx`
- [x] Transient notices are ONE toast (« Noté en mémoire », an ignored attachment); a lasting state is the status chip; the first-launch analytics notice is that chip — `packages/ui/src/components/feedback/Toast.tsx`, `packages/ui/src/components/AnalyticsNotice.tsx`
- [x] ⌘K palette: conversations, sections, settings — `packages/ui/src/containers/modals/SearchModal/`
- [x] Shared side panel, kept from one section to the next
- [x] Folding it: click the **active** tab again; closing it: the cross on its item. The
      right rail carries no panel command, and nothing hides the conversation
- [x] Right rail: browser tabs, **« Dossiers »** (granted folders as a tree + connected
      storage, only if there is something to browse), Aide and Avis —
      `packages/ui/src/containers/shell/RightRail.tsx`
- [x] 📱 Mobile replaces certain screens with its own — `packages/ui/src/containers/shell/mobile/`
- [x] Every modal is a real dialog: focus enters it, Tab stays inside, Escape closes the
      topmost one only, and focus returns to the control that opened it —
      `packages/ui/src/containers/modals/ModalShell.test.tsx`
- [x] A destructive gesture (deleting a conversation or files, changing plan) asks first in
      the ONE confirm dialog — focus on the confirm button, Escape cancels —
      `packages/ui/src/components/feedback/ConfirmDialog.tsx`

### First launch
**Access**: on first launch, after signing in — on the account's **first** device only: an
already-established account (paying subscription, or organization member) signing in on a new
machine does not go through it again — `packages/ui/src/state/auth/establishedAccount.ts`.

**What it makes possible.** Signing in by magic link or Google account, then seeing a
demonstration of redaction, choosing how to reach models — the built-in subscription or your
own key (OpenRouter, OpenAI, Anthropic…) — and tuning the categories right away, without
being forced to.

**What it gives you.** Understanding the product in thirty seconds, on an example that
actually runs rather than a screenshot — and plugging in your key in the first minute if you
have one.

**What it is worth.** The onboarding **shows**, and configures only what it is asked to: the
one choice offered (subscription or key) is optional — "Skip" leaves the free model already
active in a hosted build; without a gateway, a free model still needs an OpenRouter key. It also defuses the two reflexes that would push someone to lower the protection
("it will mask public figures" — no; "a web search will look for a fake name" — no, it offers
to reveal first).

- [x] Sign-in by magic link or Google — `packages/ui/src/pages/Login/`
- [x] Redaction demonstration, replayable afterwards from **Aide** — `packages/ui/src/components/RedactionDemo/`
- [x] Choice between a subscription CLI (Claude Code, Codex, Antigravity — the same opt-in switches as Réglages → Modèles, listed by `packages/ui/src/hooks/useAgentOptIns.ts`; each row carries the install / sign-in rows of `packages/ui/src/pages/Settings/models/AgentSetupRows.tsx`; **first and « conseillé » whenever the build can offer one**, and choosing the card switches a connected CLI on) ⇄ the built-in subscription ⇄ your own key (OpenRouter or another — the recommendation only when no CLI can be offered), optional — `packages/ui/src/pages/Onboarding/KeyChoice.tsx`
- [x] A tickable procedure to obtain the chosen provider's key + an alert on paste if the key does not have that provider's shape — `packages/ui/src/pages/Onboarding/KeySteps.tsx`
- [x] "Get a key for free" (OpenRouter) — OAuth, with no copy-paste; the key is born and stays in the main process — `apps/desktop/src/main/store/openrouterPkce.ts`
- [x] Fine-tuning the categories from the welcome, without being forced to
- [x] With the keyboard: focus enters the card and stays there, the rest of the app is inert — `packages/ui/src/hooks/useDialogFocus.ts`

### Help and feedback
**Access**: the foot of the right rail → « Aide » and « Envoyer un feedback ».

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
- [x] « Votre feedback »: feedback, with what you choose to attach — `packages/ui/src/containers/modals/FeedbackModal.tsx`
- [x] **Technical context** attachable with one switch: version, channel, screen, system,
      model, protection level — six machine values, never a line of your conversations —
      `packages/ui/src/containers/shell/hooks/useFeedback.ts`
- [x] On a **bug report**, the debug log is **attached by default** — a verbatim preview on
      screen, one gesture removes it (the collection is permanent, and a report without a log
      cost a round trip) — `packages/ui/src/containers/modals/FeedbackModal.test.tsx`
- [x] **A feedback icon under every reply** (the Copy / Regenerate / Fork bar): the
      conversation's log arrives already attached, the mood is no longer required — reporting
      no longer requires leaving the reply — `packages/ui/src/components/message/MessageBubble.tsx`
- [x] The detail of an error, copyable — `packages/ui/src/containers/modals/ErrorDetailModal.tsx`
- [x] A failed send says so **under the message**, in natural French — one message, one
      gesture, the ways out as BUTTONS: missing or refused key → enter the key; **provider
      account out of funds** ("Votre compte OpenAI n'a plus de crédits") → top up, without a
      single wasted retry; quota exhausted ("free" only if it is one) → the time it resumes;
      a simple burst → wait, with the duration quoted when it is known.
      `packages/ui/src/state/errors/errors.test.ts`
