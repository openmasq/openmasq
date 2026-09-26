## 8. Settings (« Réglages »)

**Access**: the gear in the rail · ⌘K, which indexes the settings themselves. Four visible
tabs, the rest behind « Avancé » — because a setting one is looking for is found by
searching, not by a ten-entry list.

### Account (« Compte »)
**Access**: Réglages → **Compte**.

**What it makes possible.** The device's identity — and the **Organisation** block: on a
company account it shows yours (name, plan, role, headcount, the rules it imposes, the
console link for an admin) right under the identity it governs — there is no separate tab,
nothing there is a setting; on a solo account it offers to **create one**, in the web app —
the appearance (light or dark), importing your existing conversations, the billing-mode
choice, consent to anonymous statistics, and link previews (under « Vie privée »: one
outgoing request per link is a privacy decision, not a developer toggle).

**What it gives you.** The import is the gesture that makes changing tools possible: your
ChatGPT or Claude history arrives here, and goes back to a model only **redacted** (pattern
rules on import, the on-device detector on its first send), hence reusable here without
starting from scratch. Billing leaves you the choice between your own key (you pay the
provider directly — the only route for OpenAI, Anthropic, Google, Mistral and DeepSeek) and
the included credits (nothing to configure: Scaleway + a selection of OpenRouter).

**What it is worth.** The two "discreet" settings are treated as decisions, not as
checkboxes: statistics are an explicit consent and carry counters only, never content; link
previews are **off by default** because previewing a link means making an outgoing request —
hence revealing that you received it.

- [x] Device identity, sign-out
- [x] « **Mode sombre** » (the ground: two themes, light and dark, the indigo accent is not a setting; a theme name persisted by an earlier version is still read, `packages/ui/src/state/settings/theme.ts`)
- [x] « **Importer des conversations** » (official ChatGPT / Claude exports: pattern rules on
      import, the on-device detector over the whole history the first time it goes back to a
      model — no imported message leaves before that, `send/sendOrchestrator/importedTurns.ts`)
      — the « Importer » button of Réglages → Compte opens the source + drop dialog —
      `packages/ui/src/pages/Settings/import/ImportModal.tsx`
- [x] « **Facturation des messages** » : your key, or the included credits
- [x] « **Prévenir quand une réponse arrive** »: a system notification, **only** if the
      thread is not in front of you (another window, or another conversation); the click
      brings the window to the front and opens the right thread. The banner carries
      **neither the message nor the title** of the conversation — it appears above
      everything, sometimes on a locked screen. On by default, can be turned off here —
      `packages/ui/src/state/conversation/replyNotice.test.ts`
- [x] « **Statistiques d'usage anonymes** » (explicit consent, counters only)
- [x] « **Aperçus de liens** » (opt-in, one outgoing request per link)

### Privacy, Models, Connectors, Browser (« Confidentialité », « Modèles », « Connecteurs », « Navigateur »)
**Access**: Réglages → the matching tab. The detail of each is in sections 1 to 3.

**What it makes possible.** The four tabs that govern what the app protects, what it answers
with, what it reaches, and what it may do on its own — the last one on **Connecteurs**, under
« Ce que l'agent peut faire »: the write gate and the agent browser's hardening, one family;
**Navigateur** keeps only its search engine.

**What it gives you.** Each tab is titled, described and **searchable by construction**: the
same single source feeds the rail's label, the page header and the ⌘K palette row. So a
setting cannot exist without being findable.

**What it is worth.** That is what makes it acceptable to fold six tabs behind « Avancé »:
nothing becomes unreachable, only less cluttered.

- [x] Each tab is titled and searchable by construction — `packages/ui/src/pages/Settings/settingsIndex.ts`
- [x] The settings themselves are indexed in ⌘K, not only the tabs
- [x] Réglages → Connecteurs → « Ce que l'agent peut faire »: « **Confirmation des actions** »
      and « **Sécurité du navigateur agent** » (read-only browsing, allowed domains) in ONE
      section — `packages/ui/src/pages/Settings/mcp/McpAgentPowers.tsx`
- [x] Réglages → Confidentialité → « **Options avancées** », folded: the technical log, the
      token display, what the model receives, the memory extraction — one fold for the
      toggles most accounts never touch — `packages/ui/src/pages/Settings/privacy/PrivacyTab.tsx`
- [x] Réglages → Modèles: the key lives on the provider CHIP (« Avec une clé API ») — no
      second gear per group; the price filter is a **dropdown**, hidden when every listed
      model sits in one tier; the local model waits behind an « **Avancé** » fold —
      `packages/ui/src/components/ModelSelector/PriceTierSelect.tsx`,
      `packages/ui/src/pages/Settings/models/LocalModelSection.tsx`
- [x] Réglages → Modèles → a CLI chip under « Via un agent installé » opens that agent's
      opt-in (the switch + its account/plan card) — `packages/ui/src/pages/Settings/models/AgentAccessModal.tsx`
- [x] Inside that opt-in (and the onboarding's agent list): **install the CLI from the app**
      (Claude Code, Codex — a pinned, sha256-verified download of the official build that
      then places itself; never Antigravity) and **sign it in from the app** (the CLI's own
      sign-in relayed: the page to open, the code to type or to paste), then « connectée :
      e-mail · offre » — `packages/ui/src/pages/Settings/models/AgentSetupRows.tsx`,
      `apps/desktop/src/main/subscription/install/`
- [x] Réglages → Confidentialité → either stat card of the privacy report opens the
      **by-type breakdown** (your messages, or everything ever masked) —
      `packages/ui/src/pages/Settings/privacy/PrivacyBreakdownModal.tsx`
- [x] Réglages → Confidentialité → « **Extraction automatique de la mémoire** »: the
      Mémoire's silent extraction, off by default; « retiens que… » works either way —
      `packages/ui/src/pages/Settings/privacy/PrivacyTab.tsx`
- [x] Réglages → Journal → in the redaction table, clicking a masked `•••` cell reveals that
      ONE real value beside its token, copyable — `packages/ui/src/pages/Settings/privacy/AuditRevealModal.tsx`

### Log, Usage (« Journal », « Usage »)
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
      preview…), searchable — `packages/ui/src/pages/Settings/privacy/egressLog.ts`
- [x] The two halves are **two views of a selector**, not a stack: the redaction table loads
      endlessly by pages, so the network log placed underneath was out of scrolling reach —
      `packages/ui/src/pages/Settings/privacy/AuditLogTab.tsx`
- [x] « **Exporter la mémoire (diagnostic)** » under the redaction view: the cards and their
      semantic links as a local text file, real values — `packages/ui/src/pages/Memory/MemoryExportRow.tsx`
- [x] The network log keeps the **site name only** (never the page nor the request)
- [x] Written by the privileged process, read-only for the interface — `apps/desktop/src/main/net/egressLog.ts`
- [x] Consumption per model and per conversation, estimated cost
- [x] Separation of "my key" / "subscription", and what is estimated rather than measured
- [x] The histograms have no y-axis: the **maximum is written** under the title, and
      **hovering a column** (or reaching it by keyboard) gives the day and its value, model by
      model — `packages/ui/src/pages/Settings/billing/ModelTimeline.tsx`

### Your devices (« Vos appareils »)
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

### Organization (« Organisation »)
**Access**: Réglages → **Compte** → the « Organisation » block (if the account belongs to an
organization) — no tab of its own: nothing there is a setting, an admin sets it in the console.

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
- [x] The refusal of a non-permitted model is **re-checked server-side**, the only point
      that depends on no workstation
- [x] Blocked connectors **and** a mandated confirmation level as a floor — enforced by the
      privileged process, not only by the interface
- [x] Separate admin console, hosted outside this repository
- [x] Organization-side audit log, hosted outside this repository
- [x] Shared credit pool
- [x] **Subscription manager** in the console (plan, amount actually charged, cancellation)
- [x] **The subscription follows the headcount**: an ACCEPTED invitation adds a seat billed
      pro rata, a departure removes it; a pending invitation costs nothing
- [x] The amount displayed is the one the provider charges, never a price reconstructed from
      the catalogue
- [x] A gap between active members and billed seats is **shown**, with a gesture to close it,
      never swallowed silently

### Billing (« Paiement »)
**Access**: Réglages → **Paiement** — **only in a build that sells** (`OPENMASQ_BILLING=1`;
off by default, and then the tab, every upsell and the very word « abonnement » are absent:
`packages/ui/src/send/platformAccess.test.ts`).

**What it makes possible.** A subscription with included credits, the consumption history,
and the possibility of paying nothing at all — by plugging in your own keys or staying on the
free models.

**What it gives you.** Access to the big models without opening an account at every provider,
nor managing five billings.

**What it is worth.** A send the credits cannot fund is refused **before** it leaves: an
answer is never served to be billed afterwards. The rule protects the user as much as the
publisher.

- [x] Subscription, included credits, history — `packages/credits/`
- [x] **Free mode** of a self-hosted deployment (`OPENMASQ_FREE_MODE=1` on the API **and**
      the gateway): the tab shows « Tout est inclus sur cette version » instead of the plan
      grid, every included model is offered without a credit cap, and nothing is sold —
      `packages/ui/src/pages/Settings/billing/FreeModeBilling.tsx`,
      `packages/credits/src/freeMode.ts`
- [x] A free model stays usable without a subscription
- [x] **Nothing sold by default**: without `OPENMASQ_BILLING=1` the `billing` host is not
      wired, `canPitchSubscription` is always false, the sync wall never shows, and every
      refusal names the account or the key, never an abonnement —
      `packages/ui/src/send/platformAccess.test.ts`
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
      waits. « Redémarrer maintenant » is acknowledged at once (« Redémarrage… », one click only,
      what is happening), and past twenty seconds says how to get out by hand — the update applies
      at the next launch — `UpdateReadyModal`,
      `packages/ui/src/containers/modals/UpdateReadyModal.test.tsx`,
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
- [x] « **Pile auto-hébergée** » — only in a build made with `OPENMASQ_ALLOW_CUSTOM_STACK=1`
      (never the official one): four fields (API, gateway, Supabase URL + publishable key),
      « Appliquer et redémarrer ». The addresses are validated outside the UI (https only),
      confirmed by a native dialog, and the app restarts in its own `(Custom)` profile —
      `packages/ui/src/pages/Settings/updates/parts/CustomStackCard.tsx`,
      `apps/desktop/src/environments/customStack.test.ts`
