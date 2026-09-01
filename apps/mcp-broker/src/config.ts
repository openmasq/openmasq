/**
 * Runtime config from the environment. Provider client credentials are read here
 * and ONLY here; they never appear in logs or responses.
 *
 * SHARED-KEYS / LOCAL model: the broker runs **on each user's machine** with the
 * app's *common* OAuth client credentials (the same for everyone — the user never
 * registers their own provider app). Each user's upstream tokens stay local in an
 * encrypted file (`persistence`), so there is no central database and nobody else
 * can read them. For a distributed app the `client_secret` is NOT truly secret —
 * the accepted native-app posture (RFC 8252): pair it with PKCE, or omit it
 * entirely (public client) where the provider supports it. A platform with no
 * `clientSecret` is treated as a public client and the broker adds PKCE on the
 * upstream leg. A platform with no `clientId` is unconfigured (endpoints 404).
 */

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export const config = {
  port: Number(env("PORT", "8787")),
  /** Public origin the broker is reachable at (issuer + redirect base). */
  publicUrl: env("PUBLIC_URL", "http://localhost:8787").replace(/\/$/, ""),
  /**
   * Directory for the encrypted local token file. Empty → fully in-memory (no
   * persistence): the default for tests and the cred-free demo.
   */
  dataDir: env("BROKER_DATA_DIR"),
  /**
   * Optional 32-byte key (base64 or hex) for the local token file. Unset → the
   * broker generates one and stores it next to the data with 0600 perms.
   */
  encryptionKey: env("BROKER_ENCRYPTION_KEY"),
  providers: {
    gmail: { clientId: env("GMAIL_CLIENT_ID"), clientSecret: env("GMAIL_CLIENT_SECRET") },
    slack: { clientId: env("SLACK_CLIENT_ID"), clientSecret: env("SLACK_CLIENT_SECRET") },
    github: { clientId: env("GITHUB_CLIENT_ID"), clientSecret: env("GITHUB_CLIENT_SECRET") },
  },
} as const;

export type ProviderId = keyof typeof config.providers;

/** Absolute broker URL for a path (e.g. "/oauth/token"). */
export function brokerUrl(path: string): string {
  return `${config.publicUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
