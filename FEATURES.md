# The master file

**What the app does, what it gives you, where it is, and how you reach it.** This file is
the INDEX; each section lives in its own file under `features/` so that a change to one
screen reads one file. One entry per feature: what it makes possible, what it changes for
the person using it, what it is worth — then the exact list of the gestures available.

> **Hard rule (root, rule 13).** The index and its sections are in step with reality,
> always. A feature shipped without its line is a feature nobody finds; a line that
> outlives its code is worse — it promises what no longer exists. **Enforced by
> `pnpm check:features`** (CI): it reads this index AND every `features/*.md`, re-reads
> the lists the product already single-sources (sections, tabs, settings, screens,
> modals), demands that each be named, checks that every cited path exists, that the
> counters below are the real ones, and that every section file is linked here (and only
> linked files exist). What the gate can NOT do: tell that a sentence has aged. Hence the
> checklists — gestures redone by hand, not intentions.

**How to read an entry.** `**Access**:` is the literal path from the open app; it is quoted
in the app's own words, which are French. **What it makes possible** describes the
capability, **What it gives you** the change on the user's side, **What it is worth** the
trade-off — including what it costs when it costs. The checklist enumerates the gestures;
an unchecked box is something the app does **not do yet**, not a bug.

**A build with NO backend is the repository's DEFAULT.** Apart from five public services
filled in by default, dev included — sign-in (Supabase), the Slack relay, the analytics relay,
the releases feed and Sentry (`apps/desktop/scripts/publicServices.ts`; a variable set empty
opts out) — no service address has a committed value: what the build receives decides what
EXISTS. Without them — accounts, billing, sync and devices, organizations and shares (the
inbox, "share" on the vault and the skills), "Votre feedback", included models, release
notes, auto-update and the environment switch, analytics — **none of it appears**: no tab,
no ⌘K entry, no card, no switch, and the onboarding no longer offers a subscription.
**`OPENMASQ_BILLING=1` is the gate of the remote stack** (`apps/desktop/scripts/buildDefines.ts`):
without it the API and gateway addresses are baked EMPTY even when supplied — no accounts
API, sync, organizations, feedback, included models or server-side redaction — and nothing
is sold (`send/platformAccess.ts` `subscriptionsSold`): no Paiement tab, no upsell card, no
paid wall on sync, no « Abonnement, ou votre clé » step, no surface saying « abonnement »
or « crédits ». Sign-in (Supabase), the Slack relay, analytics, release notes, auto-update
and Sentry stay on their own variables, outside the gate. Everything else (your own keys,
local models, CLI subscriptions, redaction, documents, connectors, sandbox) works as it is.
Deploying your own stack lies outside this repository.

**Scope.** The product = the desktop app (Electron). The web preview mounts the same UI with
fewer capabilities — flagged 🌐 (preview) where it differs; 📱 marks the screens of the
mobile shell in `packages/ui` (a variant built outside this repository).

**Three surfaces are governable remotely** — **Bibliothèque** (§ 4), **Compétences** (§ 5)
and **Mémoire** (§ 6): a flag removes their screen, their navigation entry, their ⌘K result
and their deep link. ⚠️ Closing an access closes a DOOR, **not the feature**: Mémoire keeps
riding along with sends and keeps taking notes, Bibliothèque keeps receiving files; only
Compétences also stop being usable (the "/" palette, pins, the model's own suggestion).
Network unreachable ⇒ the app keeps the doors as it last knew them, never closed —
`packages/ui/src/state/billing/featureAccess.ts`.

**Verified counters** (recomputed by the gate on every run) —
<!-- n:sections -->5 sections · <!-- n:onglets-reglages -->10 settings tabs ·
<!-- n:ecrans -->8 screens · <!-- n:categories-redaction -->18 redaction categories.
The number of connectors is NOT stated here: the catalogue is made of five families
(`packages/catalog/src/mcp/connectors/`) and a hand-written total would be unverifiable —
exactly what this file is not allowed to contain.

---

## Sections

Numbering is stable: prose elsewhere cites « § 4 ». Adding a section = a new file here,
linked below, in the same commit.

| § | File | What it covers |
|---|---|---|
| 1 | [`features/01-redaction-and-restitution.md`](features/01-redaction-and-restitution.md) | The promise: what is masked before leaving, what the model sees, how the reply comes back — the whole product rests on it. |
| 2 | [`features/02-conversations.md`](features/02-conversations.md) | The chat screen one lives in: composer, attachments, models and providers, the "what the model saw" view. |
| 3 | [`features/03-tools-connectors-browser.md`](features/03-tools-connectors-browser.md) | When the assistant ACTS: MCP connectors, the driven browser, the Python sandbox, and their guardrails. |
| 4 | [`features/04-library.md`](features/04-library.md) | Bibliothèque — your files, already masked. |
| 5 | [`features/05-skills.md`](features/05-skills.md) | Compétences — one list of reusable instructions, the "/" palette, pins. |
| 6 | [`features/06-memory.md`](features/06-memory.md) | Mémoire — what the app remembers between sessions, and how you see and edit it. |
| 7 | [`features/07-vault.md`](features/07-vault.md) | Coffre — your always-masked terms. |
| 8 | [`features/08-settings.md`](features/08-settings.md) | Réglages — every tab and every setting, accounts, subscription, organizations, environment. |
| 9 | [`features/09-app-frame.md`](features/09-app-frame.md) | The frame: navigation, ⌘K, onboarding, updates, feedback, the terminal card. |
| 10 | [`features/10-under-the-hood.md`](features/10-under-the-hood.md) | The guarantees you do not click: process boundaries, secrets at rest, egress guards. |
| 11 | [`features/11-platforms.md`](features/11-platforms.md) | Desktop vs web preview: what degrades silently where. |
| 12 | [`features/12-outside-the-app.md`](features/12-outside-the-app.md) | What surrounds the product as the user meets it: the help site, the optional hosted stack. |

## Editing

- A screen, tab, setting or modal added or removed edits its section **in the same commit**
  (`pnpm check:features` names the missing one). A path cited in backticks must exist.
- A number nothing can recompute does not belong here; a counter is written
  `<!-- n:key -->42` and the gate recomputes it.
- Every `### ` feature block states its `**Access**:` line and carries at least one
  `- [ ]` / `- [x]` gesture.
- This is the public repository: a section describes the app and what its user sees, never
  the internals of the services it talks to.
