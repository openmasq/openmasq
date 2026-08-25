/**
 * Shared shapes for cross-device sync. Two independent channels, deliberately:
 *
 *  1. VAULT SYNC — the reversible `placeholder→original` map (plus kinds/times),
 *     the crown jewels: it holds the REAL secrets. It is **end-to-end encrypted**
 *     on the client (see `crypto.ts`); the server only ever stores an opaque
 *     {@link EncryptedBlob}. Keyed by the web thread id, which is the same
 *     primary key every surface already uses — so a second device opening the
 *     same ChatGPT/Claude thread can pull its vault and restore replies.
 *
 *  2. ORG AUDIT — when the signed-in account belongs to an organization, the
 *     extension/desktop/mobile report **aggregate counts only** (how many of each
 *     PII class were redacted, per provider) to the org's compliance dashboard.
 *     Never a value, never a placeholder — see `events.ts`. This is metadata for
 *     the org, distinct from the encrypted vault, and travels in clear.
 */

/** The reversible redaction state for one conversation. Mirrors the fields every
 *  surface persists inline on its `Conversation` (desktop/extension/mobile). */
export interface VaultPayload {
  /** placeholder / fake → original real value. */
  redactionVault: Record<string, string>;
  /** original value → PII category (name/email/location/…). */
  redactionKinds?: Record<string, string>;
  /** original value → first-seen epoch ms. */
  redactionTimes?: Record<string, number>;
  /** Denormalised for a device that pulls a thread it has never seen. */
  title?: string;
  modelId?: string;
  /** Last local mutation time — drives last-write-wins on the envelope. */
  updatedAt: number;
}

/** What the server stores for a thread: opaque ciphertext + the public params
 *  needed to derive the key and decrypt. NONE of these reveal the plaintext. */
export interface EncryptedBlob {
  /** AES-GCM ciphertext, base64. */
  ciphertext: string;
  /** 12-byte GCM IV, base64. */
  iv: string;
  /** PBKDF2 salt, base64. */
  salt: string;
  /** Envelope version, for future key-rotation / algorithm changes. */
  v: 1;
}

/** Row metadata returned by the list endpoint (no ciphertext). */
export interface SyncedVaultMeta {
  threadId: string;
  updatedAt: number;
}

/** One conversation's server record: metadata + the encrypted blob. */
export interface SyncedVault extends SyncedVaultMeta {
  blob: EncryptedBlob;
}

/** How a device identifies itself when registering (client-held, not hardware).
 *  `deviceSecret` (random, client-generated) is stored HASHED server-side at
 *  first registration (TOFU) and later exchanged for the short-lived device
 *  token that authenticates record calls — see `transport/http.ts`. */
export interface DeviceIdentity {
  deviceId: string;
  name: string;
  platform: string;
  deviceSecret?: string;
}

/** A connected device as returned by the registry, plus a `current` flag the
 *  client sets by matching against its own `deviceId`. */
export interface DeviceInfo {
  deviceId: string;
  name: string;
  platform: string;
  lastSeenAt: number;
  createdAt: number;
  current: boolean;
}

/** An organization the caller belongs to (from GET /organizations/me). The
 *  backend returns the full org row joined with the caller's membership, so more
 *  than the three fields below may be present; these are the ones we read. */
export interface OrgRef {
  organization_uuid: string;
  organization_name?: string;
  /** Caller's role in this org: "owner" | "admin" | "member". */
  role?: string;
  /** Caller's membership status: "active" | "suspended". */
  status?: string;
  /** Plan tier mirror, "FREE" | "PRO". */
  organization_account_type?: string;
  /** URL-safe org slug (shown as the secondary line, e.g. "acme"). */
  organization_slug?: string;
  /** Free-form workspace settings JSONB. We read `.redactionPolicy` from it (an
   *  org-mandated redaction policy: the categories forced ON). */
  organization_settings?: {
    redactionPolicy?: { forcedCategories?: string[] };
    [k: string]: unknown;
  };
}

/** One row of an org's per-model routing policy (GET …/models). An ABSENT row for
 *  a model means enabled — only `enabled:false` rows block a model. */
export interface ModelPolicyRow {
  model_id: string;
  enabled: boolean;
}

/** One row of an org's per-connector MCP policy (GET …/mcp). An ABSENT row for a
 *  server means allowed — only `allowed:false` rows block a connector. */
export interface McpPolicyRow {
  server_id: string;
  allowed: boolean;
}

/** An org's (or user's) prepaid credit budget for platform-provided answer
 *  models — mapped from the backend's snake_case CreditStatus. `blocked` (balance
 *  ≤ 0) fail-closes a platform/keyless send. */
export interface CreditBalance {
  blocked: boolean;
  allotmentCents: number;
  consumedCents: number;
  balanceCents: number;
}

/** The consolidated org authorization the end-user surfaces reflect + enforce.
 *  When the user belongs to several orgs it is the MOST RESTRICTIVE consolidation:
 *  the allow-lists INTERSECT (a model must be allowed by EVERY org to be usable),
 *  every org's forced categories are forced, and one org refusing personal keys
 *  refuses them everywhere. */
export interface OrgProfile {
  /** All orgs the caller belongs to (primary = first). */
  orgs: OrgRef[];
  /** Primary org uuid — what the org-scope sync channel keys on. */
  organizationUuid?: string;
  /** Primary org display name. */
  organizationName?: string;
  /** Primary org slug (used as the "acme.com" line in the design). */
  organizationSlug?: string;
  /** Primary org plan tier ("FREE" | "PRO"). */
  plan?: string;
  /** Number of members in the primary org (best-effort; undefined if unavailable). */
  memberCount?: number;
  /** Caller's role in the primary org. */
  role?: string;
  /** Caller's status in the primary org ("active" | "suspended"). */
  status?: string;
  /** The ONLY model ids a member may use — an ALLOW-list (règle 7), not a deny-list:
   *  a model absent here is refused, so a model added to the catalog tomorrow is NOT
   *  silently available in every organisation. Intersection across the caller's orgs. */
  allowedModelIds: string[];
  /** The ONLY MCP connector ids a member may use. Same allow-list semantics. */
  allowedMcpIds: string[];
  /** Whether the member may add/use their OWN provider API keys. `false` on a managed
   *  account: the organisation supplies the models and the keys, so a personal key
   *  would be an un-governed egress the org's policy cannot see. */
  byoKeysAllowed: boolean;
  /** Redaction categories forced ON for members (union across orgs). */
  forcedCategories: string[];
  /** The policy could not be read in full (an endpoint failed). The allow-lists are
   *  then NOT authoritative — a consumer must keep its last-known-good rather than
   *  treat an empty list as "the org allows nothing", and the UI says so. */
  degraded?: boolean;
  /** Primary org's prepaid credit budget (platform-provided models). `blocked`
   *  gates platform/keyless sends. Undefined if the usage endpoint is unavailable. */
  credits?: CreditBalance;
}

/** One aggregate redaction fact — matches the backend ingestion payload exactly.
 *  `types` is a PII-class → count map; `total` their sum. No values ever. */
export interface RedactionEvent {
  provider?: string | null;
  model?: string | null;
  types: Record<string, number>;
  total: number;
}

// The record-channel (v2) shapes live in `recordTypes.ts` (rule 1 split);
// re-exported here so every existing `./types` import keeps resolving.
export * from "./recordTypes";


/**
 * The platform-injected transport. The package is otherwise pure: give it a way
 * to reach the backend (a `fetch` + a bearer-token getter) and it does the rest.
 * `getToken` returns the current Supabase access token, or null when signed out
 * (every call then no-ops — sync is best-effort, never blocks the user).
 */
export interface SyncTransport {
  listVaults(): Promise<SyncedVaultMeta[]>;
  getVault(threadId: string): Promise<SyncedVault | null>;
  putVault(threadId: string, blob: EncryptedBlob, updatedAt: number): Promise<void>;
  listOrgs(): Promise<OrgRef[]>;
  /** Full org detail incl. `member_count` (GET /organizations/:orgUuid). */
  getOrganization(orgUuid: string): Promise<{ member_count?: number } | null>;
  /** An org's per-model routing policy (absent row = enabled). */
  listModelPolicy(orgUuid: string): Promise<ModelPolicyRow[]>;
  /** An org's per-connector MCP policy (absent row = allowed). */
  listMcpPolicy(orgUuid: string): Promise<McpPolicyRow[]>;
  /** An org's prepaid credit budget (GET /organizations/:orgUuid/usage → credits). */
  getOrgUsage(orgUuid: string): Promise<CreditBalance | null>;
  reportRedactionEvents(orgUuid: string, events: RedactionEvent[]): Promise<void>;
  registerDevice(device: DeviceIdentity): Promise<void>;
  listDevices(): Promise<Omit<DeviceInfo, "current">[]>;
  revokeDevice(deviceId: string): Promise<void>;
}
