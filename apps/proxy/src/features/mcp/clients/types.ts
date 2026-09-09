// The shape every agent client is described in. One file, so the five descriptions next to
// it read as five stories rather than five variations on a signature.

/** Where a client declares its own MCP servers: a file, and the path to the map inside it. */
export interface Declaration {
  path: string;
  /** Keys to walk down to the `mcpServers` map (`["projects", cwd, "mcpServers"]`). */
  at: string[];
  /** What to call this source on screen. */
  scope: string;
}

/** One MCP server a client has of its own, however we came to learn of it. */
export interface OwnServer {
  id: string;
  /** Where it came from, for the « taking X over » line. */
  scope: string;
  /** Its endpoint, for an HTTP server — the only way to recognise OURS among the others. */
  url?: string;
  /** The entry in Claude Desktop's shape, ready for `parseServerMap`. */
  raw: unknown;
}

/** What this run can do about the client's own servers. */
export type Exclusivity =
  | {
      /** Flags, placed BEFORE the user's own arguments (`lib/wrap.ts` says why). */
      args: string[];
      /** Variables the child needs — a client whose only lever is an env var (opencode). */
      env?: Record<string, string>;
      /** A config file in the CLIENT's own shape, written under `ctx.dir` before it starts. */
      write?: { path: string; content: string };
    }
  /** Possible for this client, but not in the state its configuration is in. `why` is
   *  addressed to the user and names the ONE thing to do once; the run goes on without
   *  exclusivity, and `start.ts` says what that costs. */
  | { blocked: string };

export interface ExclusiveCtx {
  /** Our one-server config file, written for the run (Claude Desktop shape). */
  configPath: string;
  /** A private directory for this run: a client needing a file of its OWN shape puts it
   *  there, by returning `write`. Removed when the proxy exits. */
  dir: string;
  /** Our endpoint, `http://127.0.0.1:<port>/mcp`. */
  url: string;
  /** What the client itself says it has (`../own.ts`). */
  own: OwnServer[];
  /** The environment the child would inherit — read, never written. */
  env: NodeJS.ProcessEnv;
}

export interface AgentClient {
  id: string;
  /** The flags that make our endpoint its only MCP — or why it cannot, in this state. */
  exclusive(ctx: ExclusiveCtx): Exclusivity;
  /** Its own declarations, widest scope first — a duplicate id keeps the first one
   *  (`../own.ts`), which is the scope whose credentials the user gave the widest reach. */
  declarations?(cwd: string, home: string): Declaration[];
  /** …or, when its files are not all JSON, the binary is ASKED. Its own resolver is the only
   *  one that sees everything it will load, so this is the better answer where it exists. */
  probe?: { args: string[]; parse(stdout: string): OwnServer[] };
  /**
   * Run the probe a SECOND time, under the flags and environment we just computed, and name
   * the servers that survived anyway. Not a formality: for a client whose config layers can
   * outrank ours (a project file beats what opencode reads from `OPENCODE_CONFIG`), this is
   * the difference between claiming exclusivity and having it. Absent ⇒ the client's answer
   * does not reflect a session's flags, and `start.ts` says so rather than pretending.
   */
  recheck?(stdout: string, ourId: string): string[];
}
