## 4. Library (« Bibliothèque »)

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
- [x] **Grid or list** display, remembered per screen — `packages/ui/src/components/ViewModeToggle.tsx`; one toolbar row (view toggle + « Sélectionner »)
- [x] Opens in the shared side panel — **one view only, the redacted one** (+ « Conversations »); the card is the only click target (its footer keeps « Ouvrir dans l'app externe » alone)
- [x] An empty library points at « **Aller aux conversations** » — files arrive through a conversation, never from here —
      by clicking a file card or row — `packages/ui/src/pages/Library/LibraryFileModal.tsx`
- [x] "Which conversations use this file"
- [x] Re-attach a file to a new conversation (without re-OCR)
- [ ] Uploading a file straight into Bibliothèque (it goes through a conversation)
