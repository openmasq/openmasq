## 6. Memory (« Mémoire »)

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

- [x] Cards per entity + a preferences profile — screen `packages/ui/src/pages/Memory/`, CRUD `packages/ui/src/state/memory/useMemory.ts`
- [x] **Silent** extraction — a SETTING, « **Extraction automatique de la mémoire** » in Réglages → Confidentialité (`packages/ui/src/pages/Settings/privacy/PrivacyTab.tsx`, indexed in ⌘K), not a switch on the page — and **explicit** extraction (always on, 12 languages) — `packages/ui/src/memory/extractExplicit.ts`
- [x] **Graph first** (drag/zoom/reframe), the list as the second view — the choice remembered per screen like the Bibliothèque's (`packages/ui/src/hooks/useViewMode.ts`); a card's « Connexions » reach the graph from the list — `packages/ui/src/pages/Memory/MemoryGraph.tsx`, `MemoryList.tsx`
- [x] The page keeps five things — profile, search, « À revoir », Liste/Graphe, « Nouvelle fiche » (header) — and no setting; the diagnostic export moved to Réglages → Journal
- [x] Selecting a node **brings the view closer** to its neighbourhood — labels readable — and deselecting widens it again — `packages/ui/src/pages/Memory/graphFrame.test.ts`
- [x] Grouping + merge suggestions between nearby cards, computed on the device — `packages/ui/src/memory/cluster.ts`, `dedupe.ts`
- [x] « Mémoire utilisée » under a sent message, and a non-recall explained when it could surprise — ONE line per message, whatever memory has to say about it — `packages/ui/src/components/message/MemoryCaption.tsx`
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
