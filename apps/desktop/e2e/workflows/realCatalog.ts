// Le catalogue de la suite RÉELLE : les prompts du dossier `../tofix/` — des
// sessions vécues où quelque chose a mal tourné (données en clair, double envoi
// après échec à mi-parcours, boucle sur Neon, routeur vide). Chaque entrée rejoue
// le prompt tel quel contre les VRAIS connecteurs et épingle l'invariant que
// l'incident a violé. Les écritures réelles sont assumées (workspace dev) et les
// prompts d'écriture marquent leur contenu « [test e2e] » pour rester identifiables.

import { BRAND } from "@openmasq/branding";

export interface RealWorkflow {
  id: string;
  /** Le prompt d'origine (tofix), éventuellement borné pour rester inoffensif. */
  prompt: string;
  /** Préfixe d'outil attendu connecté avant l'envoi (point de synchro). */
  needsTool: string;
  /** Les SEULS connecteurs à reconnecter pour ce test (`OPENMASQ_E2E_MCP_ONLY`).
   *  ~20 outils au lieu de 450 : démarrage plus court, prompt court, routeur
   *  trivial — le test devient rapide ET reproductible. Vide ⇒ tout le compte
   *  (utile pour reproduire un incident « catalogue complet » à l'identique). */
  connectors?: string[];
  /** Outils dont la confirmation SYSTÈME doit être REFUSÉE (jamais exécutés). */
  refuse?: RegExp;
  /** Écritures dont la confirmation système est attendue AU PLUS `max` fois —
   *  `max: 1` est l'assertion anti-double-envoi (le bug « 2 mails » : un échec à
   *  mi-parcours refait l'action déjà faite → 2ᵉ confirmation → compteur à 2). */
  writes?: { tool: RegExp; max: number }[];
}

export const REAL_WORKFLOWS: RealWorkflow[] = [
  {
    // tofix/errorbrowser.md — « pick routeur VIDE (0/341) » : la boucle continuait
    // au catalogue, la réponse n'aboutissait pas. Lecture pure (bourse via
    // run_python/yfinance) : rien à confirmer, personne à écrire.
    id: "etf-pea",
    prompt:
      "Affiche l'évolution de la valeur des 5 ETF éligibles au PEA les plus performants de l'année.",
    needsTool: "run_python",
    connectors: [],  // aucun connecteur : run_python suffit (bourse via yfinance)
  },
  {
    // tofix/failneon.md — 640k tokens d'entrée (boucle) sur « liste des
    // utilisateurs en bdd sur neon » : les emails RÉELS des utilisateurs remontent
    // dans les résultats d'outils → ils doivent repartir REDACTED au modèle
    // (sentinelles REAL_PII sur le wire). Et AUCUNE écriture Neon ne doit
    // s'exécuter : toute confirmation `neon__*` est refusée (le CSV se génère en
    // local via run_python, pas en base).
    id: "neon-csv",
    prompt: "crée un csv comportant la liste des utilisateurs en bdd sur neon",
    needsTool: "neon__",
    connectors: ["neon"],
    refuse: /^neon__/,
  },
  {
    // tofix/posthog.md — rapport PostHog puis envoi Slack : c'est le cas
    // « échec à mi-chemin → envoyé DEUX fois ». L'envoi Slack doit être confirmé
    // système AU PLUS une fois, quoi qu'il arrive en amont.
    id: "posthog-slack",
    prompt:
      `Fait un rapport d'utilisation de ${BRAND.name} sur posthog et envoie le sur slack ` +
      "(commence le message par [test e2e]).",
    needsTool: "posthog__",
    connectors: ["posthog", "slack"],
    writes: [{ tool: /^slack__/, max: 1 }],
  },
  {
    // tofix/tancent.md — erreurs Sentry → ticket Linear (session interrompue puis
    // relancée dans l'incident). Un seul ticket, confirmé une seule fois.
    id: "sentry-linear",
    prompt:
      "regarder les erreurs sur sentry et crée un ticket sur linear " +
      "(préfixe le titre du ticket par [test e2e]).",
    needsTool: "sentry__",
    connectors: ["sentry", "linear"],
    writes: [{ tool: /^linear__/, max: 1 }],
  },
];
