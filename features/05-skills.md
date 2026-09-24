## 5. Skills (« Compétences »)

Stop rewriting the same thing. **One single list**: a skill is a reusable instruction, and
one that names connectors puts them to work — that is the "Routines" category, what the app
used to call a "workflow" when it was a second screen.

### Skills
**Access**: the **Compétences** section · `/` in the composer, or its « + » → « Compétence ».

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

- [x] Create, edit, file by category — screen `packages/ui/src/pages/Skills/`, logic `packages/ui/src/skills/`. « **Nouvelle compétence** » lives in the page header (the same place as the Mémoire's and the Coffre's « Créer »). Creation asks **two fields** — name and instruction (a plain markdown textarea: the chat renders it, no formatting bar, no preview) — plus the connectors fold; the description is optional and the category is chosen when editing, filed under « Rédaction » (or « Routines » the moment a connector is picked) until then — `packages/ui/src/pages/Skills/SkillModal.tsx`
- [x] A card says « N utilisations », in words
- [x] **Skills shared inside the organization** — the grid groups by scope (**Organisation** and **Équipe** sections above your cards, badged Perso): skills shared with you are used in one click. Each personal card carries **« Partager »** on hover → the same "with whom?" modal, with a **redacted preview** of the shared text ("exactly what others will see"); requests and decisions on the **« Demandes » bell** (rendered only for an organization member, or while received shares remain — `shareInboxVisible.test.ts`), an accepted person-share **adopts a copy** — sections `packages/ui/src/pages/Skills/parts/OrgSkillsBlock.tsx`, modal + bell `packages/ui/src/containers/orgShares/`, channel `packages/sync/src/orgScope/`
- [x] **Asking the assistant to write one**: "create me a skill for…" and it answers with a
      card — name, category, expandable prompt — that an **Ajouter** button files into the
      list. It is classified as a **Routine** when it drives connectors (which then show on
      the card). Nothing is added without the click, and a block still being written offers
      no button — `packages/ui/src/components/markdown/blocks/SkillProposalCard.tsx`, block reading
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
      `packages/ui/src/skills/launch.ts`, `packages/ui/src/pages/Skills/parts/ServerPicker.tsx`
- [x] The scope SURVIVES into the next turn: a routine that asks a clarifying question keeps
      its connectors for the answer — `packages/ui/src/skills/launch.test.ts`
- [x] One intent per send
- [x] Starter templates, sorted by what is already connected
- [x] « Nouvelle compétence », or editing one from its card or row, opens the ONE editor —
      name, category, description, prompt, connectors, with the suggestion pane —
      `packages/ui/src/pages/Skills/SkillModal.tsx`
- [x] **Your old workflows are carried over automatically**, with their connectors and their
      history — `packages/ui/src/skills/migrate.test.ts`
