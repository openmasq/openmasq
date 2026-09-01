# @openmasq/sync — cross-device sync

End-to-end encrypted synchronisation of a user's records (conversations oplog, vaults,
vault terms, skills) and the **organisation scopes** (shares approved by an admin or a
recipient), plus the audit trail. Pure TypeScript shared by every client.

**Boundary.** Depends on `@openmasq/schema` for shapes. The record kinds, scopes and
payload discriminators in `src/recordTypes.ts` / `src/orgScope/` are **wire literals**:
they are read back from other devices and must never change value, whatever the
identifier is called.

**Start here.** `src/records.ts` (the oplog merge), `src/vaultTerms.ts`, `src/userdata.ts`,
`src/orgScope/`.
