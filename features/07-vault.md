## 7. Vault (« Coffre »)

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

- [x] A dictionary of values masked on **every** send, whatever the conversation — screen `packages/ui/src/pages/Vault/`, logic `packages/ui/src/send/vaultTerms.ts`
- [x] Occurrence count computed on the real vaults; clicking a term's row opens
      **« Occurrences »** — where and when it was masked, each row jumping to its
      conversation — `packages/ui/src/pages/Vault/VaultUsesModal.tsx`
- [x] Holds inside a tool result too (not only in what you type)
- [x] Add a term from a selection inside a conversation
- [x] « **Ajouter un terme** » in the page header; the **category is guessed** from the value's shape with the engine's own detectors (e-mail, phone, IBAN, card…), so a paste + Enter is enough; five frequent categories shown, the other nine behind « Plus de catégories » — `packages/ui/src/pages/Vault/vaultTypes.ts`
- [x] **Edit** a term (rename it, change its category) from its row; deletion says « Supprimer », like everywhere else
- [x] The empty state says what the Coffre is for, against the categories: known shapes for them, **your own words** for it
- [x] **« Ajouter au coffre »** from the filter bar's add button or the empty screen's call:
      term, type, optional note — `packages/ui/src/pages/Vault/parts/VaultAddModal.tsx`
- [x] **Terms shared inside the organization** — the Coffre list stays ONE, badged by scope (Perso / Équipe / Orga): terms shared with you fold into it read-only, masked like yours. Each personal row carries **« Partager »** → the "with whom?" modal (the whole organization, your team, or one person — each target states **who approves**: an administrator for org/team, the recipient themselves for a person); requests arrive on the right panel's **« Demandes » bell**, and accepting a person-share **adopts a copy** into your list; end-to-end encrypted to the audience only (desktop) — badge/scopes `packages/ui/src/orgShares/scopes.ts`, modal + bell `packages/ui/src/containers/orgShares/`, merge at send time `combinedVaultTerms` (`packages/ui/src/send/vaultTerms.ts`), channel `packages/sync/src/orgScope/`
- [ ] Bulk import of a list of terms
