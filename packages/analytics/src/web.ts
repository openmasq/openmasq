/**
 * Le squelette des surfaces WEB (centre d'aide, console admin) posé sur le même noyau
 * que le bureau et l'extension.
 *
 * ⚠️ La landing en usait aussi, avant de quitter ce monorepo pour son propre dépôt
 * (18/08) — elle n'est plus un appelant CONSTATABLE d'ici, mais rien n'empêche son
 * nouveau dépôt de partager la même forme (voire ce même paquet, publié).
 *
 * Ce que ces sites ont en commun n'est pas le vocabulaire d'événements — il diffère
 * vraiment — mais la PLOMBERIE autour : un identifiant anonyme tiré une fois dans
 * `localStorage`, une configuration idempotente, et un `$pageview` dédoublonné sur
 * l'URL précédente. Écrite une fois par site, c'était la même centaine de lignes
 * répétée (règle 9) ; écrite ici, le seul point de variation qui reste au point
 * d'appel est ce qui varie pour de vrai : le vocabulaire, la source, et la manière
 * dont l'URL a le droit d'être publiée.
 *
 * ⚠️ `urlMode: "path"` n'est pas un détail de propreté. Une console applicative met
 * des SECRETS dans la barre d'adresse — `/invite?token=…` est un jeton d'invitation
 * utilisable — et `$current_url` part tel quel chez PostHog. Un site public (aide,
 * landing) veut au contraire garder sa query : c'est là que vivent les UTM. D'où un
 * réglage explicite, sans défaut implicite pour les surfaces sensibles.
 */
import { createAnalytics } from "./createAnalytics";
import type { Analytics, ConfigureOptions } from "./types";

/**
 * Le jeton d'ingestion PUBLIC du projet PostHog (`phc_…`) — conçu pour être expédié
 * dans un navigateur, ce n'est pas un secret, MAIS il identifie UN projet précis :
 * il n'est donc plus committé. Fourni par l'ENV du build consommateur
 * (`OPENMASQ_POSTHOG_KEY`, à définir/inliner par le bundler du site appelant) ;
 * absent ⇒ chaîne vide ⇒ le noyau ne configure aucun transport et reste muet —
 * jamais le projet de quelqu'un d'autre. Le garde `typeof process` couvre un import
 * navigateur brut, où `process` n'existe pas.
 */
export const OPENMASQ_POSTHOG_KEY: string =
  (typeof process !== "undefined" ? process.env?.OPENMASQ_POSTHOG_KEY : undefined) ?? "";

/** L'ingestion PostHog — cloud EU (l'organisation du produit). */
export const OPENMASQ_POSTHOG_HOST = "https://eu.i.posthog.com";

/**
 * Les clés que le `$pageview` a le droit de porter, pour que les trois sites les
 * déclarent identiquement dans leur `ALLOWED` (la marche de nettoyage jette tout ce
 * qui n'y figure pas). Un site qui ajoute une dimension étend cette liste chez lui :
 * `{ $pageview: [...PAGEVIEW_KEYS, "channel"] }`.
 */
export const PAGEVIEW_KEYS = ["$current_url", "$pathname"] as const;

/** L'événement que `capturePageview` émet. Le nom et la forme sont ceux que PostHog
 *  attend nativement, pour que ça atterrisse dans Web Analytics sans transformation. */
export interface WebPageview {
  name: "$pageview";
  $current_url?: string;
  $pathname?: string;
}

/** Un identifiant anonyme stable, tiré au sort et gardé dans `localStorage`.
 *
 *  Ce n'est PAS un cookie de pistage : un UUID aléatoire, propre à ce navigateur,
 *  sans compte derrière et sans corrélation d'un site à l'autre — il sert à compter
 *  des visiteurs, pas à reconnaître quelqu'un. Stockage indisponible (navigation
 *  privée verrouillée, iframe cloisonnée) ⇒ `"anon"`, donc un comptage dégradé
 *  plutôt qu'une exception dans un chemin qui ne doit jamais casser la page. */
export function readLocalAnonId(storageKey: string): string {
  try {
    let id = localStorage.getItem(storageKey);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(storageKey, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

export interface WebAnalyticsOptions {
  /** Le vocabulaire du site (nom d'événement → clés conservées). */
  allowed: Record<string, readonly string[]>;
  /** `source` de l'enveloppe : `"docs"` | `"web"` ici ; `"landing"` reste une valeur
   *  VALIDE si le dépôt extrait de la landing (18/08) rappelle ce noyau. */
  source: string;
  /** La clé `localStorage` de l'identifiant anonyme (une par site — pas de
   *  corrélation inter-sites, même sur un domaine partagé). */
  anonKey: string;
  /** Préfixe des diagnostics console (noms d'événements seulement). */
  logPrefix?: string;
  /**
   * Ce que `$current_url` a le droit de contenir.
   * - `"full"` : l'URL complète, query comprise (sites publics — les UTM y vivent).
   * - `"path"` : origine + chemin, **query et fragment retirés**. Le mode des
   *   surfaces applicatives, où la query porte des jetons.
   */
  urlMode: "full" | "path";
  /** Le transport. `key` absente ET `relayUrl` absente ⇒ le noyau ne configure rien
   *  et tout devient un no-op silencieux : c'est la lecture fail-closed. */
  config: Pick<
    ConfigureOptions,
    "key" | "apiHost" | "relayUrl" | "debug" | "allowLocalhost" | "env" | "appVersion"
  >;
}

export interface WebAnalytics<E extends { name: string }> {
  /** Configure le transport et allume la mesure de base. Idempotent, et sans effet
   *  hors navigateur (rendu serveur / build statique). */
  configure(): void;
  /** Une page a été vue → `$pageview`. Dédoublonné sur l'URL IMMÉDIATEMENT
   *  précédente : le double montage de React StrictMode (et tout re-rendu) ne peut
   *  pas compter deux fois, alors qu'un vrai aller-retour A→B→A compte encore. */
  capturePageview(pathname: string, extra?: Record<string, string | number | boolean | undefined>): void;
  /** Un événement propre au site, passé par la marche de nettoyage. */
  capture(event: E): void;
  /** Le noyau sous-jacent, pour ce qu'un site fait de plus (canal `$exception`,
   *  consentement révocable…). */
  core: Analytics<E>;
}

/** Compose le noyau partagé et la plomberie de site en une surface prête à monter. */
export function createWebAnalytics<E extends { name: string }>(
  opts: WebAnalyticsOptions,
): WebAnalytics<E> {
  const core = createAnalytics<E>({
    allowed: opts.allowed,
    getAnonId: () => readLocalAnonId(opts.anonKey),
    defaultSource: opts.source,
    logPrefix: opts.logPrefix,
  });

  let configured = false;
  let lastPageviewUrl = "";

  const currentUrl = (): string => {
    const loc = window.location;
    return opts.urlMode === "path" ? `${loc.origin}${loc.pathname}` : loc.href;
  };

  return {
    core,
    configure(): void {
      if (configured || typeof window === "undefined") return;
      configured = true;
      core.configureAnalytics({ source: opts.source, ...opts.config });
      // Mesure de base allumée par défaut, sans cookie ni bannière : le noyau
      // refuse déjà d'émettre sous Do-Not-Track / Global Privacy Control, et rien
      // de nominatif ne circule. Un site qui ajouterait un canal plus intrusif
      // (rejeu de session) lui demande son propre consentement, comme la landing.
      core.setAnalyticsConsent(true);
    },
    capturePageview(pathname, extra): void {
      if (typeof window === "undefined") return;
      const url = currentUrl();
      // La clé de dédoublonnage est l'URL PUBLIÉE, pas `href` : en mode `"path"`,
      // deux visites du même chemin avec des query différentes envoient la même
      // chose, et n'ont donc aucune raison de compter deux fois.
      if (url === lastPageviewUrl) return;
      lastPageviewUrl = url;
      core.captureEvent({
        ...(extra ?? {}),
        name: "$pageview",
        $current_url: url,
        $pathname: pathname,
      } as unknown as E);
    },
    capture(event: E): void {
      core.captureEvent(event);
    },
  };
}
