## 1. The promise: redaction and restitution

This is the product. Everything else serves these three moments: values are masked before
the send, the model only ever sees the masked version, and the reply comes back with your
real values put back in place.

### Redaction on send
**Access**: automatic, on every send. Visible in the send button (« Masquage » →
« Masqué »), in the composer's highlights, and in the « N à masquer » pill.

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
- [x] Restitution of the reply through the conversation's vault — `packages/redact/src/engine/vault/index.ts`
- [x] **Failure = the send is blocked**, never a silent fallback to less protection
- [x] One substitute per value, across the whole conversation (cases, fragments, tool echoes)
- [x] A secret salt per conversation: the same name does not yield the same fake elsewhere
- [x] Public figures and countries are not masked (otherwise the model answers about nobody)
- [ ] Restoring a marker the model translated (« [PERSONNE1] ») — not covered

### The 18 categories, and the protection level
**Access**: Réglages → **Confidentialité** → « **Niveau de protection** » (Allégé /
Renforcé / Strict, « Sur mesure » being the hand-set state), then the expandable matrix.
Each card names a concrete use — Allégé « recherche web et outils », Renforcé (the default)
« rédaction, e-mails, échanges courants », Strict « documents à analyser » — then what it
covers and what it leaves readable; the composer menu renders the same three sentences.
Per conversation, the LEVEL has ONE door — **the composer**: the "level" button in the action
row (tooltip = level + scope) opens the same three levels, each with what it covers and what
it leaves readable (the reduced one wears the eye), right where one notices that a send masks
too much — or too little. Its glyph keeps three strokes and bolds as many as the current level
(1 · 2 · 3); each card its own. The menu says the scope before the click. One click sets the
level on THAT CONVERSATION — the global default is changed where it is weighed (Réglages →
Confidentialité); with no conversation created yet, the default is what receives it, and the
menu says so. The fine CATEGORIES of a conversation are behind ⋯ in the chat header →
« Catégories de cette conversation · N protégés » (tagged « modifié » when the thread
deviates from the default): the chips, the thread's memory switch, and a text link to the
default level in Réglages — no level picker and no « Par défaut » tab there, so the same
setting is never offered on three screens — `packages/ui/src/containers/modals/redaction/RedactionRulesModal.tsx`.
A confirmation pill names what was set and where, with « Annuler » for a few seconds.
« Sur mesure » shows as the checked state, never as a choice; org-mandated categories are
counted under the cards — `packages/ui/src/pages/ChatWorkspace/ComposerRedactMenu.tsx`

**What it makes possible.** Deciding *what* is protected, by category: names, dates of
birth, every other date (off by default, on in Strict), e-mails, phones, addresses, places,
companies, cards, IBANs, national and company identifiers, IPs, numbers, file paths, health,
handles, URLs, keys and secrets. Three named
levels make the choice for you; « Sur mesure » is the hand-set one. The scope is global, or
**specific to a conversation**.

**What it gives you.** The slider between discretion and answer quality is yours, and it
moves where it must: one can work strictly on an HR file and leave city names in the clear
on a logistics question, without changing a global setting or an account.

**What it is worth.** Protection stays credible because the ONE preset that lowers it says
so, and only that one: « Allégé » leaves names, dates of birth, addresses, places and
companies readable — the five categories only the model detects — and handles, whose only
signal is a leading `@` (a scope, a flag, a bot mention on code as often as a person;
`FROM_RENFORCE` in `packages/catalog/src/redaction/levels.ts`), because a web search or a
connector call that queries a masked name answers about nobody. It is named as the lighter
level, wears the eye instead of the shield, states what it leaves readable on its card, is
never the install default (Renforcé is), and cannot switch off the floor (keys and secrets).
No preset lowers the protection quietly. And inside an organization, a category
mandated by the admin can be neither disabled nor revealed by a member: the policy actually
holds, it is not merely displayed.

- [x] Three named levels, « Sur mesure » being the hand-set one — `packages/ui/src/privacy/privacyLevel.ts`
- [x] **Global** scope (Réglages) or **per conversation** (the chat modal)
- [x] Exactly ONE preset lowers the protection (« Allégé »), marked with the eye, never the install default, floor kept — `packages/ui/src/privacy/privacyLevel.test.ts`
- [x] A category mandated by the organization can be neither disabled nor revealed
- [x] The composer's preview obeys the same rules as the send
- [x] Reveal a detected value one at a time (and re-mask it)
- [x] An uncertain detection is marked « **à vérifier** » (dotted) in the preview — masked by default, kept in the clear with one click if it is a false positive — `packages/ui/src/pages/ChatWorkspace/composerDetection.ts`
- [x] Notoriety follows the level: Allégé/Renforcé spare big brands, MCP integrations and public figures; **Strict** masks them too — `packages/ui/src/privacy/privacyLevel.ts`
- [x] Every category and every level also state what masking can DISTORT (not only what it covers) — `packages/ui/src/components/PrivacyLevelPicker.tsx`

### Seeing what the model saw
**Access**: under a reply → « Voir ce que le modèle a vu » (`TransparencyModal`), or
Réglages → Confidentialité → « Options avancées » → « **Journal technique détaillé** ».

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
- [x] Under each sent message, ONE short, stable mention — « **N protégés · voir** » — opens
      that same comparison; the per-category detail lives there, never in the caption —
      `packages/ui/src/components/message/MessageBubble.tsx`
- [x] **« Comprendre mon masquage »** — a small container under the first replies opens the guide's redaction chapter (public figures left in the clear, a zero counter on a conversation with no personal data, Coffre for code names); « Fermer pour toujours » (`Settings.redactionIntroSeen`), the chapter staying in Aide; never stacked with the transparency card — `packages/ui/src/privacy/redactionIntro.ts`, `packages/ui/src/pages/ChatWorkspace/RedactionIntroCard.tsx`
- [x] Global audit log, filterable and searchable — Réglages → **Journal** (the per-conversation log, an impoverished view of the same vault, was removed)
- [x] Technical **debug log**, turn by turn, **persistent** (⋯ → « Journal de débogage », visible when « Journal technique détaillé » is on) — `packages/ui/src/containers/modals/DebugLogModal/`
- [x] Copy an exchange **without** the mapping table (the text that left, alone)
- [x] **Send the log to the developers** — the debug log opens « Votre feedback » pre-filled, the mapping-free export attached and re-readable before sending — `packages/ui/src/feedback/feedback.ts` (`debugLogDraft`)
- [x] **Report from the reply itself** — a feedback icon in the action bar (next to Copy / Regenerate / Fork) opens « Votre feedback » with this conversation's log already attached; it catches the eye once per reply, then goes quiet — `packages/ui/src/feedback/feedback.ts` (`messageFeedbackDraft`)
- [x] On a report that **carries the log**, the mood becomes **optional** — the logs are the signal, and demanding a note before sending cost exactly the report one wants most (the label says so, the server applies the same rule) — `packages/ui/src/feedback/feedback.ts` (`canSendFeedback`)

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

- [x] The first changes what **you** see (the « Masqué » views of documents)
- [x] The second changes what **leaves** — and is paid for in answer quality (measured)
- [x] The send mode is pinned to the conversation, not re-read midway
- [ ] Switching an already-started conversation to the other mode — deliberately impossible
