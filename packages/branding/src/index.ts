/**
 * @openmasq/branding — LA maison des VALEURS de marque (règle 9).
 *
 * `branding.json` (à la racine de ce paquet) est le fichier de config par défaut : toute
 * VALEUR de marque qui atteint le runtime, le fil ou le disque (domaines, scheme de
 * deep-link, bundle id, adresse de support…) se DÉRIVE d'ici, jamais d'un littéral. Le
 * NOM lui-même sert aussi de namespace technique (scope npm, env `OPENMASQ_*`,
 * `window.openmasq`) depuis la migration du 24/08/2026 — sa simple apparition n'est plus
 * une faute ; `check:brand` garde désormais le retour de l'ANCIEN nom de code.
 *
 * ⚠️ Beaucoup de ces valeurs sont PERSISTÉES ou SUR LE FIL : clés localStorage
 * (`brandKey("device-id")`), en-têtes HTTP (`brandHeader("sig")`), scheme de deep-link,
 * bundle id, domaines que le parc installé appelle. Changer une valeur du JSON change
 * donc le produit construit ET casse la compatibilité avec l'existant — c'est un choix
 * de marque, pas un refactor.
 */
import config from "../branding.json";

export interface BrandConfig {
  /** Nom d'affichage du produit (UI, emails, titres de fenêtre). */
  name: string;
  /** Jeton minuscule : clés de stockage, en-têtes, noms d'artefacts (`<slug>-jail.exe`). */
  slug: string;
  /** Zone DNS primaire — les surfaces vivent sur ses sous-domaines (`app.`, `help.`…). */
  domain: string;
  /** Domaine marketing secondaire. */
  altDomain: string;
  /** Scheme des deep-links de l'app de bureau (`<protocol>://…`). */
  protocol: string;
  /** Identifiant de bundle de l'app de bureau (mac/Windows). */
  desktopBundleId: string;
  /** Hôte Sentry de l'organisation. */
  sentryHost: string;
  /** Organisation HuggingFace qui héberge les ré-exports de modèles épinglés. */
  hfOrg: string;
  /** Adresse de support affichée à l'utilisateur. */
  supportEmail: string;
  /** Zone d'envoi des emails transactionnels. */
  mailDomain: string;
}

export const BRAND: BrandConfig = config;

/** `brandHost("app")` → `app.<domain>` ; sans argument → le domaine nu. */
export const brandHost = (sub?: string): string =>
  sub ? `${sub}.${BRAND.domain}` : BRAND.domain;

/** `brandUrl("app", "/invite")` → `https://app.<domain>/invite`. */
export const brandUrl = (sub?: string, path = ""): string =>
  `https://${brandHost(sub)}${path}`;

/** Clé/nom préfixé par le slug : `brandKey("device-id")` → `<slug>-device-id`. */
export const brandKey = (suffix: string): string => `${BRAND.slug}-${suffix}`;

/** En-tête HTTP propriétaire : `brandHeader("sig")` → `x-<slug>-sig`. */
export const brandHeader = (suffix: string): string => `x-${BRAND.slug}-${suffix}`;
