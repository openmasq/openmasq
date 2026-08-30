import type { Feedback } from "../avis/avis";
// The org profile carries the SAME prepaid budget shape as an individual one — one home
// for it (`billing.ts`), never a parallel definition on the org side (rule 9).
import type { CreditBalance } from "./billing";

/** A signed-in account (Supabase on desktop). */
export interface AuthUser {
  id: string;
  email?: string;
  /** Display name from the auth provider (OAuth `user_metadata.full_name`/`name`), when
   *  known — used only to personalise the home greeting. Absent for email-only sign-ins;
   *  a nameless greeting is the correct fallback, never a name derived from the email. */
  name?: string;
}
/**
 * Optional account authentication — PASSWORDLESS magic link via Supabase on
 * desktop. The flow: `sendMagicLink(email)` emails a sign-in link; clicking it returns
 * to the app via a `<protocol>://` deep link, which the platform exchanges for a session —
 * `onChange` then fires. When absent, the app skips the login gate entirely (e.g. the
 * browser preview).
 *
 * ⚠️ **`sendMagicLink` ne crée PAS forcément le compte.** Cela dépend du réglage
 * d'inscription de l'instance Supabase visée, et la production les a FERMÉES : une
 * adresse non provisionnée reçoit un refus (`{ error }`), pas un lien. Un appelant ne
 * doit donc jamais annoncer d'avance qu'une adresse inconnue ouvrira un compte —
 * `pages/Login/loginErrors.ts` traduit le refus quand il arrive.
 */
export interface AuthHost {
  /** Current session's user, or null if signed out. */
  getSession(): Promise<AuthUser | null>;
  /** Current session's access token (JWT) for authenticating to first-party
   *  services (e.g. the remote redaction function), or null if signed out. */
  getAccessToken?(): Promise<string | null>;
  /** Subscribe to auth changes; returns an unsubscribe function. */
  onChange(cb: (user: AuthUser | null) => void): () => void;
  /** Force a session refresh NOW — drives the active auto-reconnect loop while the
   *  "reconnexion automatique" banner is up (`useAuthReconnect`). On success the
   *  platform fires `onChange` (TOKEN_REFRESHED) which clears `reconnecting`;
   *  rejects/returns null on a still-unreachable server so the loop backs off and
   *  retries. Absent = no ACTIVE reconnect: recovery falls back to the platform's
   *  own passive signals (browser `online`, internal refresh timer). Distinct from
   *  `getSession`, which is offline-TOLERANT and returns the cached user during an
   *  outage — it can never tell us the server came back. */
  reconnect?(): Promise<AuthUser | null>;
  /** Email a magic sign-in link. The session is established asynchronously when the user
   *  clicks it (`onChange` fires). ⚠️ Ne crée un compte que si l'instance Supabase visée
   *  autorise les inscriptions — la production ne les autorise PAS (voir l'en-tête). */
  sendMagicLink(p: { email: string }): Promise<{ error?: string }>;
  /** Complete sign-in with the emailed one-time CODE (the SAME email carries both
   *  a link and an 8-digit code). Present when the platform can verify a code
   *  directly — the robust path where the deep-link/redirect flow is fragile
   *  (desktop). On success `onChange` fires. Absent = link-only. */
  verifyCode?(p: { email: string; code: string }): Promise<{ error?: string }>;
  /** True when the emailed LINK is the primary path on this platform — the
   *  desktop, whose magic link returns via the `<protocol>://` deep link, so the
   *  email is rendered link-first. The login screen then LEADS with "click the
   *  link" and tucks the code entry behind a fallback disclosure (still offered
   *  when `verifyCode` exists, for a failed deep link). Absent/false = code-first
   *  (the code field is shown up front). */
  linkFirst?: boolean;
  /** Start Google OAuth. Opens the provider consent in the system browser; the
   *  redirect returns via the same `<protocol>://auth/callback` deep link the magic
   *  link uses, so `onChange` fires on success. Absent = no Google button. */
  signInWithGoogle?(): Promise<{ error?: string }>;
  signOut(): Promise<void>;
}

/** A device connected to the account for cross-device sync. */
export interface SyncDeviceInfo {
  deviceId: string;
  name: string;
  platform: string;
  /** epoch ms of the last sync heartbeat. */
  lastSeenAt: number;
  createdAt: number;
  /** True for the device the UI is running on. */
  current: boolean;
}

/**
 * Optional cross-device sync capability (E2E-encrypted vault sync + org audit +
 * the connected-devices registry), surfaced in Settings. The **passphrase** is
 * the E2E key — it never leaves the user's devices, so the platform stores it
 * LOCALLY (never synced, never sent). `enabled` is false when no sync backend is
 * wired (device calls then return []); absent entirely = no sync UI at all.
 */
/** Ce que Réglages → Synchronisation montre de l'état RÉEL : à qui l'app parle, et le
 *  dernier échange vécu par cette session. La synchro est best-effort (une panne est
 *  silencieuse par contrat) — ce témoin est ce qui l'empêche d'être invisible. */
export interface SyncStatusSnapshot {
  /** Le nom de l'environnement effectif (« staging », « production »…). */
  env: string;
  /** L'hôte de l'API visée (jamais un jeton, jamais un chemin). */
  backendHost: string;
  lastOkAt: number | null;
  lastErrorAt: number | null;
  /** Raison courte du dernier échec (« HTTP 403 », « serveur injoignable ») ou null. */
  lastError: string | null;
  /** La panne ne se réparera pas d'elle-même — un geste humain est nécessaire (corriger
   *  la phrase secrète). Absent/false ⇒ un simple réessai peut suffire. Change la PHRASE
   *  affichée : promettre « réessaiera tout seul » sur une panne définitive apprend à
   *  ignorer le témoin. */
  lastErrorFatal?: boolean;
}

export interface SyncHost {
  /** Whether a sync backend is configured (a build-time URL is present). */
  enabled: boolean;
  /** L'état courant du témoin — optionnel : un hôte qui ne l'offre pas (aperçu, mobile
   *  pas encore câblé) cache la ligne plutôt que d'afficher un état inventé. */
  status?(): Promise<SyncStatusSnapshot>;
  /** The current E2E passphrase, or null if the user hasn't set one (sync off). */
  getPassphrase(): Promise<string | null>;
  setPassphrase(passphrase: string): Promise<void>;
  /** Confronter une phrase aux enveloppes DÉJÀ côté serveur (« mismatch » = une autre
   *  phrase règne — dit tout de suite, jamais bloquant). Optionnel sans backend. */
  verifyPassphrase?(passphrase: string): Promise<"match" | "mismatch" | "no-envelopes" | "unreachable">;
  clearPassphrase(): Promise<void>;
  /** Suggest a strong random passphrase (for the first device to set one). */
  generatePassphrase(): string;
  /** The account's connected devices (empty when signed out / backend off). */
  listDevices(): Promise<SyncDeviceInfo[]>;
  /** Forget a device by id. */
  revokeDevice(deviceId: string): Promise<void>;
  /** Rename THIS device (stored locally + re-registered so it sticks across
   *  heartbeats). Only the current device is renamable — a name set from another
   *  device would be overwritten on this one's next heartbeat. */
  setDeviceName(name: string): Promise<void>;
}

/**
 * The signed-in member's consolidated organization authorization — what the
 * end-user surfaces REFLECT (membership + role) and ENFORCE (allowed models,
 * mandated redaction categories). Mirrors `@openmasq/sync`'s `OrgProfile`; the
 * desktop host builds it from the sync client's `getOrgProfile()`. When the user
 * belongs to no org (or is signed out / the backend is off) the whole profile is
 * absent → nothing is enforced and the app behaves exactly as for a solo user.
 */
export interface OrgProfileInfo {
  /** Primary org uuid — what the org-scope sync channel keys on. */
  organizationUuid?: string;
  /** Primary org display name. */
  organizationName?: string;
  /** Primary org slug (secondary line in the org card). */
  organizationSlug?: string;
  /** Primary org plan tier: "free" | "solo" | "team" | "scale" (legacy: FREE/PRO). */
  plan?: string;
  /** Member count of the primary org (best-effort; undefined if unavailable). */
  memberCount?: number;
  /** Caller's role: "owner" | "admin" | "member". */
  role?: string;
  /** Caller's membership status: "active" | "suspended". */
  status?: string;
  /** The ONLY model ids the org permits — an ALLOW-list (règle 7): absent = refused
   *  on send and DISABLED (with the reason) in the pickers, so a model added to the
   *  catalogue tomorrow is not silently usable; an org starts with everything off. */
  allowedModelIds: string[];
  /** The ONLY MCP connector ids the org permits. Same allow-list semantics: absent =
   *  locked (non-connectable) and its tools are stripped from the agentic loop. */
  allowedMcpIds: string[];
  /** Whether the member may add/use their OWN provider API keys. `false` on a managed
   *  account: the organisation supplies the models AND the keys, so a personal key
   *  would be egress its policy cannot see. The keys screen says so plainly. */
  byoKeysAllowed: boolean;
  /** Redaction categories the org forces ON — locked (non-disableable) for members. */
  forcedCategories: string[];
  /** The policy could not be read in full. The allow-lists are NOT authoritative and
   *  the surfaces say « politique indisponible » instead of pretending the org allows
   *  nothing — the last-known-good is what the host keeps enforcing. */
  degraded?: boolean;
  /** Confirmation posture the org imposes as a FLOOR: a member may tighten it, never
   *  loosen it. Absent = no floor. Composed with the member's own choice in MAIN
   *  (`composeConfirmationMode`) — the composition takes the stricter of the two, which
   *  is why an unverified floor is safe: it can only ever add confirmations. */
  confirmationFloor?: "standard" | "renforce";
  /** Prepaid credit budget for platform-provided answer-model usage (Scaleway/
   *  OpenRouter on the platform's key). Absent = unknown → not enforced. `blocked` = budget
   *  exhausted: platform-provided sends fail closed (BYO-own-key + redaction are
   *  never affected). Amounts in eurocents. Populated by the host from
   *  GET …/organizations/:id/usage. */
  credits?: CreditBalance;
}

/**
 * Optional organization capability. Present when the platform can reach the
 * backend (a build-time URL + a signed-in session); absent = no org concept, the
 * app is a solo product. Best-effort: `getProfile` returns null on any failure.
 */
export interface OrgHost {
  getProfile(): Promise<OrgProfileInfo | null>;
  /** Open the org admin console (the web app's `/admin`) in the system browser.
   *  Present only when an admin URL is configured; the UI shows the link only for
   *  owners/admins when this exists. */
  openAdmin?(): void;
}

/**
 * Optional user FEEDBACK transport — the rail's "Votre avis" modal. Absent (browser
 * preview, or any surface with no backend) ⇒ the action is not offered at all,
 * rather than offered and dead.
 *
 * `send` REJECTS with a user-facing (French) message when the avis could not be
 * delivered, so the modal can say so. It must NEVER resolve on a failure: the modal
 * then tells the user their message reached the team, and a success screen over a
 * dropped message is a lie. Same contract as `BillingHost.startCheckout`.
 */
export interface AvisHost {
  /** Deliver one avis. Resolves ONLY once the backend accepted it. */
  send(avis: Feedback): Promise<void>;
}
