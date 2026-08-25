import { createSink } from "@openmasq/analytics";
import { BRAND } from "@openmasq/branding";

/**
 * The desktop analytics transport = the SHARED `@openmasq/analytics` sink, wired
 * with a localStorage-backed anonymous id. All the transport logic (relay-or-direct
 * PostHog, the double consent + Do-Not-Track/GPC gate, the neutral relay envelope,
 * fire-and-forget POST) lives in the shared package now — identical to the
 * extension's — so this file only supplies the desktop's id source + source tag.
 *
 * MANUAL events only: no posthog-js (its autocapture would scrape DOM text, a
 * privacy hole in an app whose whole point is hiding text).
 */

const ANON_KEY = `${BRAND.slug}.analytics.aid`;

/**
 * D'où vient l'id STABLE de la plateforme (bureau : l'`installId` d'`updates.json`, un
 * uuid par machine qui survit à un profil vidé). Une SOURCE, pas une valeur poussée : le
 * sink attend `getAnonId()`, donc rien ne peut partir avant qu'elle ait répondu.
 *
 * ⚠️ C'est la correction du 12/08, et la forme compte. L'ancienne version poussait l'id
 * depuis `main.tsx` par un `updates.current().then(adoptStableId).catch(() => {})` en
 * parallèle du démarrage, en pariant que la file d'attente du sink tiendrait plus
 * longtemps que l'aller-retour IPC. Deux façons de perdre ce pari, et elles gravent leur
 * résultat : si la file part la première, ou si `current()` échoue / n'existe pas sur
 * cette plateforme, on frappait un `anon-…` et on le PERSISTAIT — l'install ne pouvait
 * plus jamais devenir stable, puisque l'adoption n'écrase rien. Mesuré dans PostHog :
 * 291 identités `anon-…` contre 46 uuid, et une neuve encore le 12/08.
 */
let stableIdSource: (() => Promise<string | undefined>) | null = null;

/** Déclarer la source AVANT le premier événement (voir `main.tsx`). */
export function setStableIdSource(fn: () => Promise<string | undefined>): void {
  stableIdSource = fn;
}

/** Une seule identité par session : la première résolution est mémorisée telle quelle. */
let pending: Promise<string> | null = null;

const read = (): string | null => {
  try {
    return localStorage.getItem(ANON_KEY);
  } catch {
    return null;
  }
};
const write = (id: string): void => {
  try {
    localStorage.setItem(ANON_KEY, id);
  } catch {
    /* localStorage indisponible — l'id vaut pour la session */
  }
};
const randomAnon = (): string =>
  "anon-" + Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * L'ordre est la fonctionnalité :
 *  1. un id DÉJÀ posé gagne toujours — la continuité d'une install existante prime, et
 *     c'est ce qui évite de refendre son historique en deux « personnes » ;
 *  2. sinon l'id de la plateforme, persisté : il survit à un localStorage vidé ;
 *  3. sinon un aléatoire — persisté SEULEMENT si cette plateforme n'a pas de source du
 *     tout (mobile, aperçu web : le local est alors le mieux disponible). Une source qui
 *     existe mais a ÉCHOUÉ ne fait rien graver : l'id ne vaut que pour cette session, et
 *     le lancement suivant retentera d'adopter le vrai. Échouer en churn se rattrape,
 *     échouer en gel ne se rattrape pas.
 */
async function resolveId(): Promise<string> {
  const stored = read();
  if (stored) return stored;
  if (!stableIdSource) {
    const local = randomAnon();
    write(local);
    return local;
  }
  const platform = await stableIdSource().catch(() => undefined);
  if (platform) {
    write(platform);
    return platform;
  }
  return randomAnon();
}

function anonId(): Promise<string> {
  return (pending ??= resolveId());
}

/**
 * L'identité PostHog de cette installation — la MÊME résolution que le sink, pas une
 * seconde. Exposée pour UNE raison : l'avis. Une fiche de feedback qui porte cet id se
 * joint aux événements, erreurs et sessions PostHog de l'installation qui l'a envoyée —
 * sans lui, « Impossible d'utiliser mon modèle par défaut » ne se recoupe avec aucune
 * télémétrie et se diagnostique à l'aveugle.
 *
 * ⚠️ C'est une JONCTION assumée entre deux canaux tenus séparés partout ailleurs :
 * l'analytics est anonyme par construction, l'avis est identifié (jeton vérifié). La
 * jonction n'existe que sur le geste EXPLICITE de l'utilisateur, sous l'interrupteur
 * « contexte technique » de la modale, qui l'annonce. Ne jamais brancher ce getter sur
 * un canal qui part sans geste de l'utilisateur.
 */
export const analyticsDistinctId = (): Promise<string> => anonId();

/** Tests uniquement : oublier la résolution mémorisée de cette session. */
export function __resetAnalyticsIdForTests(): void {
  pending = null;
  stableIdSource = null;
}

export const { configureAnalytics, setAnalyticsConsent, setAnalyticsSuspended, sink, captureError, fetchFlags } = createSink({
  getAnonId: anonId,
  defaultSource: "desktop",
  logPrefix: "[analytics]",
});
