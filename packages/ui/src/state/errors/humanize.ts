import type { SendErrorReason } from "../../analytics/events";
import type { Message } from "../../types";
import { PROVIDERS, providerCreditsExhausted, rateLimitInfo, type ProviderId } from "@openmasq/llm";
import { CreditsExhaustedError, MissingApiKeyError, RateLimitError } from "./classes";
import { BRAND } from "@openmasq/branding";

// ── Règles de rédaction des messages utilisateur (ce fichier est leur foyer) ──
// 1. UN message = UN geste. Les alternatives sont des BOUTONS (CTA de la carte,
//    sélecteur de modèle) — les réénumérer en prose fait cinq lignes pour trois
//    clics visibles, et c'est le tic d'écriture le plus machinal du corpus.
// 2. Un tiret cadratin par message MAXIMUM ; sinon, un point. La structure
//    « affirmation — précision » répétée partout est une signature, pas un style.
// 3. Aucun mot que l'utilisateur n'emploierait pas : « interface », « moteur »,
//    « plateforme », « wire » restent dans le code. Nommer les choses de SON monde
//    (« votre compte OpenAI », pas « le compte de votre clé chez le fournisseur »).
// Les promesses de confidentialité (« rien n'est parti ») sont un choix produit :
// elles restent — dites une fois, sans la démonstration en « donc ».

/**
 * Best-effort detection of a rate-limit error. The typed class is LOST across the
 * main↔renderer IPC boundary (a 429 from `@openmasq/llm` arrives as a plain
 * Error), so we also match the serialised message text.
 */
export function isRateLimitError(err: unknown): boolean {
  if (err instanceof RateLimitError) return true;
  const m = err instanceof Error ? err.message : String(err);
  return /\b429\b/.test(m) || /rate[\s_-]?limit/i.test(m);
}

/** Une clé refusée par le fournisseur — présente mais fausse (faute de frappe,
 *  révocation, rotation). Le préflight ne couvre que la clé ABSENTE ; ce cas-ci
 *  traversait jusqu'au 401 du fournisseur et s'affichait en JSON anglais brut.
 *  Chaînes stables des trois gros : OpenAI (`invalid_api_key` / "Incorrect API key"),
 *  Anthropic (`authentication_error` / "invalid x-api-key"), Google ("API key not
 *  valid"). Volontairement PAS un `\b401\b` nu : un 401 peut aussi être la session
 *  l'app sur le chemin plateforme, qui a son propre message. */
const INVALID_KEY = /invalid_api_key|incorrect api key|invalid x-api-key|authentication_error|api key not valid/i;

/**
 * Map a raw provider/tool/IPC error string to a friendly FR message when it
 * carries a KNOWN bounded code. Typed error classes are lost across the
 * main↔renderer IPC boundary, and the gateway answers with codes like
 * `CREDITS_EXHAUSTED` (402) / `MODEL_NOT_ALLOWED` (400) — which otherwise reach the
 * user as `Error invoking remote method '…': … {"error":"CREDITS_EXHAUSTED"}`.
 * Returns null when nothing is recognised (the caller keeps its own fallback).
 *
 * `opts.personal` — whether the account is INDIVIDUAL (no org): the gateway's 402
 * names whose budget is exhausted, and « le budget de votre organisation » shown to
 * someone who has no organisation reads as someone else's error. The caller knows
 * (`!orgProfile`); default stays the org wording for compatibility.
 *
 * `opts.provider` — the provider of the model in flight, when the caller knows it.
 * « Votre compte OpenAI n'a plus de crédits » is a sentence; « le compte de votre clé
 * chez le fournisseur » is a periphrase nobody says out loud. Absent, the wording
 * falls back to « chez le fournisseur ».
 */
export function humanizeSendError(
  raw: string,
  opts?: { personal?: boolean; provider?: ProviderId },
): string | null {
  const m = raw || "";
  /** « OpenAI », or null when the caller couldn't say. */
  const name = opts?.provider ? (PROVIDERS[opts.provider]?.label ?? opts.provider) : null;
  const chez = name ? `chez ${name}` : "chez le fournisseur";
  if (/CREDITS_EXHAUSTED/.test(m)) return new CreditsExhaustedError(opts?.personal ?? false).message;
  if (/CREDITS_UNVERIFIABLE/.test(m)) {
    // Fail-closed volontaire de la passerelle (solde illisible ≠ solde à zéro) : la
    // cause est transitoire, et « rien n'est parti » est la première question.
    return "On n'a pas pu vérifier vos crédits. Rien n'est parti — réessayez.";
  }
  if (/MODEL_NOT_ALLOWED/.test(m)) {
    return `Ce modèle n'est pas disponible avec votre compte ${BRAND.name}. Choisissez-en un autre.`;
  }
  if (/UPSTREAM_(ERROR|UNAVAILABLE)/.test(m)) {
    // Bounded gateway code — covers a transient upstream blip AND a persistent
    // misconfiguration indistinguishably (the body is deliberately message-free),
    // so don't promise « temporaire » : offer the model switch as the way out.
    return `${BRAND.name} n'a pas pu joindre le fournisseur. Réessayez, ou changez de modèle.`;
  }
  // AVANT le 429 : l'insufficient_quota d'OpenAI EST un 429, et la branche rafale lui
  // répondait « patientez quelques secondes » — faux sur la cause (pas une rafale), le
  // remède (seul un paiement le débloque) et la temporalité. Le 400 « credit balance is
  // too low » d'Anthropic, lui, tombait jusqu'au JSON brut. Même parse que la politique
  // de retry (`@openmasq/llm`), qui échoue vite sur ce cas pour la même raison.
  if (providerCreditsExhausted(m)) {
    // L'acteur nommé, un geste, pas de périphrase. Le CTA clé est un BOUTON
    // (`sendErrorAction` → missing_key).
    return name
      ? `Votre compte ${name} n'a plus de crédits. Rechargez-le chez ${name}, ou changez de modèle.`
      : "Votre compte chez le fournisseur n'a plus de crédits. Rechargez-le, ou changez de modèle.";
  }
  if (INVALID_KEY.test(m)) {
    return name
      ? `Votre clé ${name} a été refusée. Vérifiez-la, ou renseignez-en une nouvelle.`
      : "Votre clé a été refusée par le fournisseur. Vérifiez-la, ou renseignez-en une nouvelle.";
  }
  // A 429 used to fall through to the raw provider JSON — a wall of headers and ids
  // where the one thing the user needed (« c'est reparti demain à 2 h ») was buried.
  // The class comes from `@openmasq/llm`'s parse, the SAME one the retry policy reads.
  if (/\b429\b/.test(m) || /rate[\s_-]?limit/i.test(m)) {
    const rl = rateLimitInfo(m);
    if (!rl.daily) {
      // « quelques secondes » n'est dit que quand on ne sait pas mieux : la passerelle
      // met sa fenêtre (`retryAfterMs`) dans le corps, autant la citer.
      const wait = rl.retryAfterMs ? formatWait(rl.retryAfterMs) : "quelques secondes";
      return `Trop de requêtes d'un coup. Attendez ${wait} et réessayez.`;
    }
    // Le TEXTE porte la cause et l'heure de reprise — « Ça repart demain à 2 h » dit
    // déjà que réessayer avant est inutile. Les issues sont des BOUTONS (l'abonnement
    // en CTA, le sélecteur de modèle sous le message) : pas d'énumération en prose.
    // « gratuites » seulement quand le CORPS le dit (`rl.free`) : périodique n'implique
    // pas gratuit, et un palier journalier sur clé PAYANTE l'affichait à qui paie.
    const when = rl.resetAt ? ` Ça repart ${formatReset(rl.resetAt)}.` : "";
    if (rl.free) {
      // Les sources gratuites connues sont journalières (free-models-per-day…), donc
      // « du jour » est exact ici — il ne l'est pas pour un quota périodique quelconque.
      const cap = rl.limit ? `${rl.limit.toLocaleString("fr-FR")} requêtes gratuites` : "requêtes gratuites";
      return `Vos ${cap} du jour sont épuisées.${when}`;
    }
    return `Votre quota ${chez} est épuisé pour le moment.${when}`;
  }
  if (/MODEL_STALL/.test(m)) {
    // La CAUSE la plus fréquente reste dite — sans elle, « pas de réponse » n'oriente
    // vers aucun geste.
    return "Le modèle n'a pas répondu. Souvent : trop de connecteurs actifs — essayez d'en déconnecter quelques-uns.";
  }
  return null;
}

/** « ~30 s » / « ~1 min » — une attente annoncée par le refuseur, dite en unités
 *  qu'on lit d'un coup d'œil. Arrondi vers le haut : promettre moins que la fenêtre
 *  ferait rebuter le « Réessayer » une seconde trop tôt. */
function formatWait(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `~${s} s`;
  return `~${Math.ceil(s / 60)} min`;
}

/** « demain à 02:00 » / « le 5 août à 02:00 » — a reset the user can plan around, not an
 *  epoch. Same day ⇒ just the hour; tomorrow ⇒ named; beyond ⇒ the date. Exported: the
 *  low-quota warning must word the SAME reset the exhaustion message does (rule 9). */
export function formatReset(at: number): string {
  const d = new Date(at);
  const hh = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const days = Math.round(
    (new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000,
  );
  if (days <= 0) return `à ${hh}`;
  if (days === 1) return `demain à ${hh}`;
  return `le ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} à ${hh}`;
}

/**
 * Strip the technical noise from an unrecognised error so it's at least readable:
 * drop the Electron `Error invoking remote method '…':` / `Error:` wrappers and
 * collapse a trailing `{"error":"CODE"}` body down to `(CODE)`. Used as the
 * fallback when {@link humanizeSendError} doesn't recognise the error.
 */
export function cleanErrorText(raw: string): string {
  let s = (raw || "").trim();
  s = s.replace(/^Error invoking remote method\s+'[^']*':\s*/i, "");
  s = s.replace(/^Error:\s*/i, "");
  const code = s.match(/\{\s*"error"\s*:\s*"([A-Za-z0-9_]+)"[^}]*\}/);
  if (code) s = s.replace(/:?\s*\{\s*"error"\s*:\s*"[A-Za-z0-9_]+"[^}]*\}\s*$/, ` (${code[1]})`);
  return s.trim() || "Une erreur est survenue.";
}

/**
 * Map a send failure to a BOUNDED analytics reason code (never the raw text).
 *
 * Vit ici et non dans une vue : la boucle agentique en a besoin elle aussi, et c'est
 * là que les 17 % de runs qui meurent au premier tour deviennent lisibles. Une seconde
 * copie côté agent aurait dérivé de celle-ci (règle 9).
 */
export function sendErrorReason(e: unknown): SendErrorReason {
  if (e instanceof MissingApiKeyError) return "missing_key";
  // Avant le 429 : l'insufficient_quota d'OpenAI porte un 429 mais n'est PAS une
  // limite de débit — compté `rate_limit`, il gonflait la mauvaise colonne ; le 400
  // d'Anthropic, lui, se comptait `bad_request` pour un problème de facturation.
  const rawText = e instanceof Error ? e.message : String(e);
  if (providerCreditsExhausted(rawText)) return "provider_credits";
  if (e instanceof RateLimitError || isRateLimitError(e)) return "rate_limit";
  const t = rawText.toLowerCase();
  if (/401|403|unauthor|forbidden|invalid.*(key|token)|api key/.test(t)) return "auth";
  if (/econnrefused|fetch failed|failed to fetch|enotfound|network|timed out|timeout|socket/.test(t))
    return "network";
  if (/\b5\d\d\b|server error|internal error|bad gateway|unavailable/.test(t)) return "server";
  // Any other 4xx the provider rejected (401/403 already returned "auth" above):
  // a malformed/unsupported request — e.g. a param the model deprecated.
  if (/\b4\d\d\b|invalid.?request|bad request|deprecated|unsupported|not supported|unprocessable/.test(t))
    return "bad_request";
  return "unknown";
}

/**
 * Le BOUTON à offrir sous un envoi échoué, déduit du texte brut du fournisseur.
 *
 * Une seule maison : le chemin simple et la boucle agentique échouent dans deux fonctions
 * différentes de `store.ts`, et c'est exactement ainsi qu'une des deux se retrouve sans
 * issue proposée. `undefined` = rien à proposer (« Réessayer » suffit).
 *
 * `provider` — le fournisseur du modèle en cours, quand l'appelant le connaît : une clé
 * refusée ou un compte fournisseur à sec s'offrent la modale de clé (`missing_key`, la
 * plomberie existante — saisir une autre clé puis régénérer en place). Sans lui, texte
 * seul : un CTA clé sans fournisseur n'ouvrirait rien.
 *
 * ⚠️ Le quota PÉRIODIQUE reste le seul à recevoir l'abonnement. Une rafale de 429 se
 * résout d'elle-même en quelques secondes : y coller « prenez un abonnement » vendrait
 * une solution à un problème qui n'existe déjà plus.
 */
export function sendErrorAction(raw: string, provider?: ProviderId): Message["errorAction"] | undefined {
  const m = raw || "";
  if (provider && (providerCreditsExhausted(m) || INVALID_KEY.test(m))) {
    return { kind: "missing_key", provider, label: PROVIDERS[provider]?.label ?? provider };
  }
  if (!/\b429\b/.test(m) && !/rate[\s_-]?limit/i.test(m)) return undefined;
  return rateLimitInfo(m).daily ? { kind: "upgrade_plan" } : undefined;
}
