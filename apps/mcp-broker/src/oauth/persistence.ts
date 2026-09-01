import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.js";
import { decrypt, encrypt, loadKey } from "./crypto.js";
import type { BrokerToken, RegisteredClient } from "./store.js";

/**
 * Durable broker state, persisted ENCRYPTED on the local machine. Only the
 * long-lived records are saved — registered clients and issued tokens (which
 * carry the user's upstream provider tokens). Ephemeral OAuth state (pending
 * federations, single-use auth codes) is intentionally NOT persisted: a restart
 * mid-login just means the user retries.
 *
 * No `dataDir` configured → a no-op backend (pure in-memory): the default for
 * tests and the cred-free demo.
 */
export interface Snapshot {
  clients: RegisteredClient[];
  tokens: [string, BrokerToken][];
  refresh: [string, string][];
}

export interface Persistence {
  load(): Snapshot | null;
  save(snap: Snapshot): void;
}

const NOOP: Persistence = { load: () => null, save: () => {} };

export function createPersistence(): Persistence {
  if (!config.dataDir) return NOOP;
  const dir = config.dataDir;
  const file = join(dir, "tokens.enc");
  const key = loadKey(dir, config.encryptionKey);

  return {
    load() {
      if (!existsSync(file)) return null;
      try {
        return JSON.parse(decrypt(readFileSync(file, "utf8"), key)) as Snapshot;
      } catch (err) {
        console.error("[broker] could not read token file (ignoring):", (err as Error).message);
        return null;
      }
    },
    save(snap) {
      try {
        writeFileSync(file, encrypt(JSON.stringify(snap), key), { mode: 0o600 });
      } catch (err) {
        console.error("[broker] could not write token file:", (err as Error).message);
      }
    },
  };
}
