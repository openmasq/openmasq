import { useEffect } from "react";
import { fetchFlags } from "../analytics/posthog";
import { setFeatureAccessFromFlags } from "./featureAccess";
import { BRAND } from "@openmasq/branding";

/**
 * Le TRANSPORT des drapeaux d'accès — le pendant de `featureAccess.ts`, qui n'en tient
 * que la valeur résolue et les prédicats.
 *
 * Trois sources, dans cet ordre, et l'ordre EST le correctif :
 *  1. les défauts compilés (`@openmasq/catalog`) — déjà en place avant tout code d'ici ;
 *  2. le CACHE de la dernière réponse connue, appliqué SYNCHRONEMENT au démarrage ;
 *  3. le relais, quand il répond.
 *
 * ⚠️ L'étape 2 n'est pas une optimisation. Sans elle, chaque lancement affiche l'app
 * avec les défauts pendant l'aller-retour réseau, puis une section DISPARAÎT sous les
 * yeux de l'utilisateur une seconde plus tard — et hors ligne elle ne disparaîtrait
 * jamais. Une porte fermée doit l'être dès la première frame, et le rester sans réseau.
 *
 * ⚠️ Et le cache ne se referme JAMAIS sur une panne : une réponse illisible ou absente
 * laisse en place ce qu'on avait, et un premier lancement hors ligne garde les défauts
 * (« le produit tel qu'il est livré »). Rien ici ne peut retirer une section parce que
 * le réseau est tombé.
 */

const CACHE_KEY = `${BRAND.slug}.featureFlags`;
/** Le parc n'a pas besoin d'une bascule à la seconde : un écran qui apparaît ou
 *  disparaît sous le curseur est pire que dix minutes de retard. */
const REFRESH_MS = 15 * 60 * 1000;

type FlagMap = Record<string, boolean | string>;

function readCache(): FlagMap | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as FlagMap) : null;
  } catch {
    // Pas de localStorage (aperçu SSR, contexte restreint) : on reste aux défauts.
    return null;
  }
}

function writeCache(flags: FlagMap): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(flags));
  } catch {
    /* quota / stockage indisponible — le prochain lancement retentera le réseau */
  }
}

/** Le cache s'applique SYNCHRONEMENT, à l'import — avant même le premier rendu, donc
 *  avant qu'une section fermée ait pu clignoter à l'écran. */
const cached = readCache();
if (cached) setFeatureAccessFromFlags(cached);

async function refresh(): Promise<void> {
  const flags = await fetchFlags();
  if (!flags) return; // pas de transport / hors ligne / illisible ⇒ on garde l'état
  setFeatureAccessFromFlags(flags);
  writeCache(flags);
}

/**
 * Monté par `AppShell` — donc par TOUTE app hôte, sans qu'aucune ait à s'en souvenir.
 * `configureAnalytics` (l'URL du relais, la clé d'attestation) a déjà tourné à ce
 * moment-là : les hôtes le font avant de rendre React. Ne rejette jamais.
 */
export function useFeatureFlags(): void {
  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(id);
  }, []);
}
