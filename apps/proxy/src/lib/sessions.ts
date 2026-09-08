// Vaults kept between requests, keyed by the caller's `x-openmasq-session` header, so a
// multi-turn client gets the SAME fake for the same value across turns. In memory only, on
// this machine only, evicted after `ttlMs` of silence — the vault is the sensitive object here
// (it maps fakes back to real values), so it never touches disk.
import { randomBytes } from "node:crypto";
import type { Vault } from "@openmasq/redact";

/** A vault and the 256-bit key its fakes are drawn under (hex, what `pseudonymize` takes). */
export interface KeyedVault {
  vault: Vault;
  key: string;
}

export const freshKey = (): string => randomBytes(32).toString("hex");

export class VaultSessions {
  private readonly vaults = new Map<string, { vault: Vault; key: string; last: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** The session's vault and key, created on first use; fresh ones when `id` is empty. */
  get(id: string | undefined): KeyedVault {
    if (!id) return { vault: {}, key: freshKey() };
    this.sweep();
    const hit = this.vaults.get(id);
    if (hit) {
      hit.last = this.now();
      return { vault: hit.vault, key: hit.key };
    }
    const entry = { vault: {} as Vault, key: freshKey(), last: this.now() };
    this.vaults.set(id, entry);
    return { vault: entry.vault, key: entry.key };
  }

  size(): number {
    return this.vaults.size;
  }

  private sweep(): void {
    const cutoff = this.now() - this.ttlMs;
    for (const [id, s] of this.vaults) if (s.last < cutoff) this.vaults.delete(id);
  }
}

/** A session id is opaque to us; bound its size so a header can't grow the map key. */
export function sessionIdFrom(header: string | string[] | undefined): string | undefined {
  const v = Array.isArray(header) ? header[0] : header;
  if (!v) return undefined;
  const id = v.trim();
  return id && id.length <= 128 ? id : undefined;
}
