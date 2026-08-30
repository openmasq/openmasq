/**
 * La PILE AUTO-HÉBERGÉE — le troisième environnement, `"custom"`, dont les adresses ne
 * sont PAS cuites au build mais saisies par l'utilisateur (Réglages → Versions).
 *
 * ⚠️ C'est une exception DÉLIBÉRÉE à la garde « un nom, jamais une URL » de `index.ts`,
 * et elle n'existe que dans un build qui l'a demandée : `OPENMASQ_ALLOW_CUSTOM_STACK=1`
 * (`scripts/buildDefines.ts`). Le binaire officiel ne pose jamais cette variable — un
 * pointeur `custom` y est relu comme la production (`main/environment.ts`). Un fork qui
 * se builde pour être pointé vers SA pile la pose, et accepte ce que ça ouvre :
 *
 * - Ce qui est persisté est alors bien une adresse. Ce qui la borne : **https
 *   obligatoire** (http seulement vers la boucle locale — un jeton en clair sur un LAN
 *   est un jeton lu), pas d'identifiants dans l'URL, pas de requête ni de fragment ; le
 *   couple Supabase va ENSEMBLE ; la validation vit ICI (pure, testée) et se rejoue en
 *   MAIN à chaque écriture, jamais seulement dans l'écran (règle 7).
 * - L'écriture demande une **confirmation NATIVE** (`dialog.showMessageBox`, dans le
 *   processus privilégié) — qu'un renderer compromis ne peut pas cliquer.
 * - L'environnement `custom` ouvre son **PROPRE profil** `userData` (`main/profile.ts`),
 *   comme staging : un détournement n'atteindrait qu'un profil vide, jamais le coffre et
 *   les clés de la production.
 * - La CSP du renderer est élargie aux SEULES origines déclarées, par main, au chargement
 *   (`main/customStackCsp.ts`) — jamais un joker.
 *
 * Résidu assumé, dit ici parce qu'il est vrai : dans un build qui l'autorise, un XSS du
 * renderer peut PROPOSER une adresse ; il ne peut pas la faire accepter sans un clic
 * humain sur une boîte native, et ce qu'il obtiendrait est un profil neuf.
 */
import type { EnvUrls } from "./index";

/** Le build autorise-t-il une pile saisie ? Cuit au build, jamais lu à l'exécution. */
export const CUSTOM_STACK_ALLOWED: boolean = process.env.OPENMASQ_ALLOW_CUSTOM_STACK === "1";

export interface CustomStack {
  /** L'API (`apps/backend`). Obligatoire — c'est l'objet de la pile. */
  backend: string;
  /** La passerelle (`apps/gateway`). Vide ⇒ ni redaction cloud ni modèles inclus. */
  gateway: string;
  /** Le projet d'auth (Supabase/GoTrue) et sa clé PUBLIABLE — ensemble ou pas du tout. */
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export type CustomStackRefusal =
  | "not_object"
  | "backend_required"
  | "not_absolute"
  | "not_https"
  | "userinfo"
  | "query_or_hash"
  | "supabase_pair";

export type CustomStackVerdict =
  | { ok: true; stack: CustomStack }
  | { ok: false; reason: CustomStackRefusal; field?: keyof CustomStack };

const URL_FIELDS = ["backend", "gateway", "supabaseUrl"] as const;

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Une adresse de service acceptable, normalisée (origine + chemin sans `/` final). */
function checkUrl(raw: string): { ok: true; url: string } | { ok: false; reason: CustomStackRefusal } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: "not_absolute" };
  }
  if (u.protocol !== "https:" && !(u.protocol === "http:" && LOOPBACK.has(u.hostname))) {
    return { ok: false, reason: "not_https" };
  }
  if (u.username || u.password) return { ok: false, reason: "userinfo" };
  if (u.search || u.hash) return { ok: false, reason: "query_or_hash" };
  return { ok: true, url: `${u.origin}${u.pathname.replace(/\/+$/, "")}` };
}

/**
 * Valider ce qui arrive du renderer (ou du disque). Chaque champ est trimmé ; un champ
 * absent vaut vide. Fail-closed : le moindre doute est un refus nommé, jamais un
 * « on verra à l'usage ».
 */
export function validateCustomStack(raw: unknown): CustomStackVerdict {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "not_object" };
  const r = raw as Record<string, unknown>;
  const str = (k: keyof CustomStack): string => (typeof r[k] === "string" ? (r[k] as string).trim() : "");
  const out: CustomStack = {
    backend: str("backend"),
    gateway: str("gateway"),
    supabaseUrl: str("supabaseUrl"),
    supabaseAnonKey: str("supabaseAnonKey"),
  };
  if (!out.backend) return { ok: false, reason: "backend_required", field: "backend" };
  for (const field of URL_FIELDS) {
    if (!out[field]) continue;
    const v = checkUrl(out[field]);
    if (!v.ok) return { ok: false, reason: v.reason, field };
    out[field] = v.url;
  }
  // Le couple Supabase va ENSEMBLE : une URL sans clé (ou l'inverse) est une auth qui
  // échoue à mi-chemin au lieu de ne pas exister — la même règle que la table cuite.
  if (!!out.supabaseUrl !== !!out.supabaseAnonKey) {
    return { ok: false, reason: "supabase_pair", field: out.supabaseUrl ? "supabaseAnonKey" : "supabaseUrl" };
  }
  return { ok: true, stack: out };
}

/** La table d'adresses d'une pile saisie — la même forme que `ENVIRONMENTS[name]`. */
export function customEnvUrls(stack: CustomStack): EnvUrls {
  return {
    backend: stack.backend,
    admin: stack.backend ? `${stack.backend}/admin` : "",
    supabaseUrl: stack.supabaseUrl,
    supabaseAnonKey: stack.supabaseAnonKey,
    redactFn: stack.gateway,
  };
}

/** Les ORIGINES à ajouter au `connect-src` du renderer — exactement celles déclarées
 *  (+ `wss://` pour le temps réel Supabase), jamais un joker. Dédoublonnées, ordonnées. */
export function customCspOrigins(stack: CustomStack): string[] {
  const out = new Set<string>();
  for (const raw of [stack.backend, stack.gateway, stack.supabaseUrl]) {
    if (!raw) continue;
    try {
      out.add(new URL(raw).origin);
    } catch {
      /* déjà refusé par validateCustomStack ; ici on n'élargit rien sur un doute */
    }
  }
  if (stack.supabaseUrl) {
    try {
      const u = new URL(stack.supabaseUrl);
      out.add(`${u.protocol === "http:" ? "ws" : "wss"}://${u.host}`);
    } catch {
      /* idem */
    }
  }
  return [...out];
}

/**
 * Élargir le `connect-src` de la CSP statique d'`index.html` aux origines données.
 * Ne touche QUE cette directive, et seulement si elle existe : une page sans CSP ne
 * reçoit rien (elle n'en avait pas besoin), et aucune autre directive ne bouge.
 */
export function patchCspConnectSrc(html: string, origins: string[]): string {
  if (origins.length === 0) return html;
  return html.replace(/connect-src ([^;"]*)/, (_m, rest: string) => `connect-src ${rest.trim()} ${origins.join(" ")}`);
}
