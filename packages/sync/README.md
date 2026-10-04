[Français](README.fr.md)

# @openmasq/sync

**End-to-end encrypted sync between devices, and the organization channels.**

The client side of OpenMasq sync, in plain TypeScript with WebCrypto and `fetch`. The
server only ever stores ciphertext. In this repository the consumer is the desktop
renderer (`apps/desktop/src/renderer/src/sync/`). It is a private workspace package, not
published on npm.

## What's inside

- **Record sync**: conversations, the integrations directory, skills, workflows, memory and
  vault terms, as an append-only log of encrypted records. Merging is a union, with
  last-write-wins per entity on Lamport clocks (`src/records.ts`).
- **Vault sync**: the redaction vault of a conversation, encrypted on the device and stored
  as one opaque blob (`src/vaultClient.ts`).
- **Organization shares**: vault terms and skills shared with the whole organization, a
  team or one person, readable only once approved (`src/orgScope/`).
- **Organization audit**: counts of redacted values per category, never a value
  (`src/events.ts`).
- **Transports**: `httpTransport` and `orgHttpTransport` (`src/transport/`).

## Develop

```bash
pnpm --filter @openmasq/sync build       # tsup, into dist/
pnpm --filter @openmasq/sync typecheck
pnpm test packages/sync                  # from the root
```

> [!NOTE]
> Sync needs a backend that is not part of this repository. A build from these sources
> runs without it.

> [!IMPORTANT]
> Record kinds and scope names are read back by other devices, so their string values must
> never change, even when the identifier is renamed. `VAULT_TERMS_SCOPE`, for example, is
> `"@coffre"` (`src/recordTypes.ts`, `src/orgScope/orgTypes.ts`).
