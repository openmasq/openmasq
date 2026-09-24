/**
 * Where a local tool keeps what it needs to reconnect to an OAuth MCP server between runs:
 * the client it registered (DCR), the tokens, and the loopback PORT it registered them
 * against. One encrypted file, one entry per server id.
 *
 * The port is stored for a reason that is easy to miss: the redirect URI is part of the
 * registration, so coming back on a different port means registering again — and some
 * providers show the consent screen again for it.
 */
import { join } from "node:path";
import type { StoredOAuthState } from "../transport/oauth";
import { SecretJsonFile } from "./secretFile";

interface StoredServer {
  oauth?: StoredOAuthState;
  port?: number;
}

interface Doc {
  servers: Record<string, StoredServer>;
}

export class McpOAuthStore {
  private readonly file: SecretJsonFile<Doc>;
  private doc: Doc;

  /** `dir` holds both the key (0600) and the encrypted store. */
  constructor(
    private readonly dir: string,
    fileName = "mcp-auth.enc",
    envKey = "",
  ) {
    this.file = new SecretJsonFile<Doc>(join(dir, fileName), dir, envKey);
    this.doc = this.file.read() ?? { servers: {} };
  }

  /** Where the material lives, for a CLI that must be able to say so. */
  get location(): string {
    return this.dir;
  }

  loadOAuth(id: string): StoredOAuthState | undefined {
    return this.doc.servers[id]?.oauth;
  }

  saveOAuth(id: string, state: StoredOAuthState): void {
    this.doc.servers[id] = { ...this.doc.servers[id], oauth: state };
    this.file.write(this.doc);
  }

  loadPort(id: string): number | undefined {
    return this.doc.servers[id]?.port;
  }

  savePort(id: string, port: number): void {
    this.doc.servers[id] = { ...this.doc.servers[id], port };
    this.file.write(this.doc);
  }

  /** True when this server has tokens — what a `status` line reports. */
  isAuthorized(id: string): boolean {
    return !!this.doc.servers[id]?.oauth?.tokens?.access_token;
  }

  ids(): string[] {
    return Object.keys(this.doc.servers);
  }

  /** Forget one server entirely. The port goes too: a fresh login should not inherit a
   *  redirect URI whose registration we just dropped. */
  forget(id: string): boolean {
    if (!this.doc.servers[id]) return false;
    delete this.doc.servers[id];
    this.file.write(this.doc);
    return true;
  }
}
