/**
 * L'ATTESTATION DE BUILD posée sur les requêtes vers le relais — extraite de `sink.ts`
 * parce que deux chemins la partagent désormais (les événements et les drapeaux), et
 * qu'elle n'a rien à voir avec le transport lui-même.
 *
 * `HMAC-SHA256(appKey, "<ts>.<nonce>")` via Web Crypto, ce qui évite toute bibliothèque
 * de crypto. ⚠️ **Anti-abus, jamais une identité** : ça authentifie le BUILD client,
 * pas un utilisateur — donc l'anonymat tient, et une requête part aussi bien déconnecté.
 * Le relais vérifie puis JETTE. Limite honnête : la clé est extractible d'un bundle
 * expédié, c'est un filtre à robots, pas un mur (la limite de débit est le vrai garde-fou).
 * Jamais sur le chemin PostHog direct.
 */
// Seule dépendance du paquet : la maison de la marque — zéro dep elle-même (un JSON +
// des helpers purs), donc la règle « browser globals only » tient dans le popup, le
// content-script isolé et le renderer. Le relais vérifie ces NOMS d'en-têtes tels quels.
import { BRAND } from "@openmasq/branding";

/** Lowercase-hex of `bytes` random bytes (Web Crypto — a browser/Node global). */
export const randomHex = (bytes: number): string => {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
};

/** `HMAC-SHA256(key, msg)` as lowercase hex, via Web Crypto (no crypto library needed). */
export const hmacHex = async (key: string, msg: string): Promise<string> => {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(msg));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
};

/** Les en-têtes d'attestation, ou `{}` sans clé (le relais accepte quand il n'est pas
 *  configuré — dev) ou si Web Crypto jette. Ne rejette jamais. */
export async function attestHeaders(appKey: string | undefined): Promise<Record<string, string>> {
  if (!appKey) return {};
  try {
    const ts = String(Date.now());
    const nonce = randomHex(16);
    const sig = await hmacHex(appKey, `${ts}.${nonce}`);
    const h = (suffix: string): string => `X-${BRAND.name}-${suffix}`;
    return { [h("Ts")]: ts, [h("Nonce")]: nonce, [h("Sig")]: sig };
  } catch {
    return {};
  }
}
