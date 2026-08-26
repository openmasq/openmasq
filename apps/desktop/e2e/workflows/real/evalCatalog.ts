import { BRAND } from "@openmasq/branding";
import type { LabPrompt } from "./lab";

/*
 * LE CATALOGUE D'ÉVALUATION — ce sur quoi la fiabilité agentique se mesure.
 *
 * Deux familles, volontairement séparées :
 *  • SIMPLE  — une intention, un connecteur. Sert de PLANCHER : si un modèle échoue
 *              là, rien d'autre ne compte.
 *  • COMPLEXE — plusieurs connecteurs ET un CHAÎNAGE : la sortie d'un outil est
 *              l'entrée du suivant (une erreur Sentry devient un ticket, un chiffre
 *              Stripe devient un e-mail). C'est là que les boucles agentiques
 *              cassent en vrai, et donc là que la guidance se juge.
 *
 * Chaque groupe déclare ses connecteurs : un groupe = une app = un catalogue
 * d'outils court. Le même catalogue sert AUX DEUX BANCS — fixtures (gratuit,
 * déterministe) et e2e (vrais serveurs) — pour que les chiffres soient comparables.
 *
 * ⚠️ LES CONNECTEURS DÉCLARÉS DOIVENT ÊTRE RÉELLEMENT BRANCHÉS. Une entrée OAuth
 * dans le store ne prouve rien : Tavily, Stripe et Attio en avaient une et ne se
 * connectaient pas — les groupes qui les citaient tournaient sans eux et
 * produisaient des chiffres qui ne mesuraient rien (un « aucun outil appelé » a
 * même été pris pour un échec de routage alors que le service était absent).
 * `assertConnectorsAvailable` échoue désormais bruyamment ; ce catalogue ne cite
 * que des services vérifiés connectés sur le compte dev.
 *
 * ⚠️ LES ÉCRITURES SE DÉCLARENT. `approveWrites` vaut `false` par défaut (`lab.ts`) :
 * seul un prompt dont l'écriture EST l'objet de la mesure porte `approveWrites: true`.
 * L'inverse — approuver sauf mention contraire — a laissé le modèle poser un événement
 * inventé dans l'agenda RÉEL sur `prep-journee`, un scénario pourtant annoté « Lecture
 * seule », et le banc l'a compté comme un succès (journal du 27/07/2026).
 *
 * ⚠️ NEON EST EN LECTURE SEULE, sans exception : `approveWrites: false` reste écrit
 * explicitement sur tout prompt qui l'approche — redondant avec le défaut, et c'est
 * voulu : la contrainte doit se lire sur le prompt, pas se déduire d'une absence.
 */

/** L'unique destinataire autorisé pour un envoi de test — l'adresse de support de la
 *  marque (`branding.json`), jamais un littéral qui survivrait à un changement de zone. */
export const TEST_RECIPIENT = BRAND.supportEmail;

export interface EvalGroup {
  id: string;
  /** Les SEULS connecteurs reconnectés (`OPENMASQ_E2E_MCP_ONLY`) / servis en fixtures. */
  connectors: string[];
  /** Préfixe d'outil attendu avant d'envoyer — point de synchro déterministe. */
  needsTool: string;
  /** `complexe` = chaînage multi-connecteurs (le cœur du bench). */
  family: "simple" | "complexe";
  prompts: LabPrompt[];
}

/* ── FAMILLE SIMPLE : le plancher ───────────────────────────────────────────── */

const SIMPLE: EvalGroup[] = [
  {
    id: "mail",
    family: "simple",
    connectors: ["gmail"],
    needsTool: "gmail__",
    prompts: [
      { id: "inbox-brief", prompt: "Résume mes derniers e-mails : qu'est-ce que j'ai raté d'important cette semaine ?" },
      {
        id: "email-send",
        prompt:
          `Envoie un e-mail à ${TEST_RECIPIENT} avec pour objet « [test e2e] Point hebdo » ` +
          `et un corps court qui propose un point de 30 minutes jeudi prochain.`,
        // Écriture VOULUE : ce scénario la mesure, donc il l'autorise.
        approveWrites: true,
      },
    ],
  },
  {
    id: "agenda",
    family: "simple",
    connectors: ["google-calendar"],
    needsTool: "google-calendar__",
    prompts: [
      { id: "agenda-semaine", prompt: "Qu'est-ce que j'ai à mon agenda cette semaine ?" },
      {
        id: "rdv-create",
        prompt: "Crée dans mon agenda un événement « [test e2e] Revue produit » jeudi prochain de 14h à 14h30.",
        // Écriture VOULUE : ce scénario la mesure, donc il l'autorise.
        approveWrites: true,
      },
    ],
  },
  {
    id: "produit",
    family: "simple",
    connectors: ["posthog", "sentry"],
    needsTool: "posthog__",
    prompts: [
      { id: "posthog-usage", prompt: "Fais-moi un point sur l'utilisation du produit cette semaine d'après PostHog." },
      { id: "sentry-triage", prompt: "Quelles sont les erreurs les plus fréquentes sur Sentry, et lesquelles sont nouvelles ?" },
    ],
  },
  {
    id: "divers",
    family: "simple",
    connectors: ["github", "notion", "google-docs"],
    needsTool: "github__",
    prompts: [
      { id: "github-prs", prompt: "Quelles pull requests sont ouvertes sur mes dépôts GitHub ?" },
      { id: "notion-notes", prompt: "Qu'est-ce que j'ai dans mes pages Notion en ce moment ?" },
      {
        id: "doc-create",
        prompt: "Rédige une note de cadrage produit en 5 points et enregistre-la dans un Google Doc « [test e2e] Cadrage ».",
        // Écriture VOULUE : ce scénario la mesure, donc il l'autorise.
        approveWrites: true,
      },
    ],
  },
];

/* ── FAMILLE COMPLEXE : le chaînage multi-outils ────────────────────────────── */

const COMPLEXE: EvalGroup[] = [
  {
    // La chaîne d'incident, celle du dossier `tofix/` : constater → tracer →
    // prévenir. Trois connecteurs, DEUX écritures sortantes, et un passage de
    // données (l'id de l'erreur doit se retrouver dans le ticket puis le message).
    id: "incident",
    family: "complexe",
    connectors: ["sentry", "linear", "slack"],
    needsTool: "sentry__",
    prompts: [
      {
        id: "triage-complet",
        prompt:
          "Identifie l'erreur la plus fréquente sur Sentry, crée un ticket Linear pour la corriger " +
          "(titre préfixé « [test e2e] », description reprenant le nombre d'occurrences), " +
          "puis poste sur Slack un message court annonçant le ticket créé (préfixe « [test e2e] »).",
        // Écriture VOULUE : ce scénario la mesure, donc il l'autorise.
        approveWrites: true,
      },
    ],
  },
  {
    // Le croisement de DEUX sources hétérogènes (usage produit vs santé technique)
    // puis une synthèse écrite. Teste la capacité à ne PAS boucler sur une source
    // quand l'autre suffit, et à produire un livrable.
    id: "revue",
    family: "complexe",
    connectors: ["posthog", "sentry", "google-docs"],
    needsTool: "posthog__",
    prompts: [
      {
        id: "revue-hebdo",
        prompt:
          "Compare l'utilisation du produit (PostHog) et les erreurs (Sentry) de la semaine, " +
          "dégage 3 constats, puis enregistre la synthèse dans un Google Doc intitulé " +
          "« [test e2e] Revue hebdo produit ».",
        // Écriture VOULUE : ce scénario la mesure, donc il l'autorise.
        approveWrites: true,
      },
    ],
  },
  {
    // Facturation → relance : le chemin le plus chargé en PII (un paiement échoué
    // porte le nom ET l'e-mail d'un client). L'e-mail doit partir vers l'adresse de
    // test, JAMAIS vers le client trouvé dans l'outil — c'est l'assertion clé.
    id: "facturation",
    family: "complexe",
    connectors: ["supabase", "gmail"],
    needsTool: "supabase__",
    prompts: [
      {
        id: "relance-paiement",
        prompt:
          "Interroge la base Supabase pour trouver les comptes dont l'abonnement a expiré, " +
          `puis envoie à ${TEST_RECIPIENT} un e-mail « [test e2e] Comptes à relancer » ` +
          "résumant combien ils sont et depuis quand.",
        // Écriture VOULUE : ce scénario la mesure, donc il l'autorise.
        approveWrites: true,
      },
    ],
  },
  {
    // Le fan-out : trois sources lues en parallèle pour UNE réponse de synthèse.
    // Lecture seule — mesure la largeur (a-t-il consulté les trois ?) plus que la
    // profondeur, et pénalise les modèles qui s'enferment sur une seule source.
    id: "journee",
    family: "complexe",
    connectors: ["google-calendar", "gmail", "linear"],
    needsTool: "google-calendar__",
    prompts: [
      {
        id: "prep-journee",
        prompt:
          "Prépare ma journée : ce que j'ai à l'agenda, les e-mails qui demandent une réponse, " +
          "et mes tickets Linear en cours. Donne-moi un plan en 5 points maximum.",
      },
    ],
  },
  {
    // Veille → livrable → diffusion. Trois connecteurs, deux écritures, et une
    // dépendance stricte : le lien du Doc doit apparaître dans le message Slack.
    id: "veille",
    family: "complexe",
    connectors: ["notion", "google-docs", "slack"],
    needsTool: "notion__",
    prompts: [
      {
        id: "veille-diffusion",
        prompt:
          "Reprends mes notes Notion, fais-en une synthèse dans un Google Doc " +
          "« [test e2e] Synthèse notes », puis poste sur Slack un message « [test e2e] » " +
          "avec le lien du document.",
        // Écriture VOULUE : ce scénario la mesure, donc il l'autorise.
        approveWrites: true,
      },
    ],
  },
  {
    // ⚠️ NEON EN LECTURE SEULE. Le croisement base ↔ facturation est le pire cas
    // de PRIVACY du produit : les deux outils rendent de vraies adresses, qui
    // doivent repartir REDACTED au modèle. Le livrable est LOCAL (run_python),
    // jamais une écriture en base — `approveWrites: false` est désormais le défaut,
    // et reste écrit ici pour que la contrainte se lise sur le prompt.
    id: "donnees",
    family: "complexe",
    connectors: ["neon", "supabase"],
    needsTool: "neon__",
    prompts: [
      {
        id: "audit-comptes",
        prompt:
          "Croise la liste des utilisateurs en base Neon avec les données Supabase " +
          "pour repérer les comptes actifs sans abonnement en cours. " +
          "Produis le résultat sous forme de tableau CSV dans la conversation — " +
          "n'écris RIEN en base.",
        approveWrites: false,
      },
    ],
  },
  {
    // CRM → agenda → e-mail : la chaîne commerciale, trois connecteurs et une
    // écriture. Teste la reprise d'un contexte lu (le prospect) dans un livrable.
    id: "crm",
    family: "complexe",
    connectors: ["airtable", "google-calendar", "gmail"],
    needsTool: "airtable__",
    prompts: [
      {
        id: "relance-prospect",
        prompt:
          "Regarde mes prospects dans Airtable, choisis celui à relancer, " +
          "vérifie un créneau libre dans mon agenda cette semaine, " +
          `et envoie la proposition de créneau à ${TEST_RECIPIENT} (objet préfixé « [test e2e] »).`,
        // Écriture VOULUE : ce scénario la mesure, donc il l'autorise.
        approveWrites: true,
      },
    ],
  },
  {
    // Chiffres → tableur : la sortie doit être STRUCTURÉE (pas de prose), ce qui
    // piège les modèles qui répondent au lieu d'appeler l'outil d'écriture.
    id: "tableur",
    family: "complexe",
    connectors: ["supabase", "google-sheets"],
    needsTool: "supabase__",
    prompts: [
      {
        id: "rapport-chiffre",
        prompt:
          "Récupère les comptes créés récemment dans Supabase, compte-les par plan, " +
          "et dépose le détail dans une Google Sheet intitulée « [test e2e] Paiements du mois ».",
        // Écriture VOULUE : ce scénario la mesure, donc il l'autorise.
        approveWrites: true,
      },
    ],
  },
];

export const EVAL_GROUPS: EvalGroup[] = [...SIMPLE, ...COMPLEXE];

/** Sélection par famille / id, via `E2E_EVAL_FAMILY` + `E2E_EVAL_ONLY`. */
export function selectGroups(family?: string, only?: string): EvalGroup[] {
  return EVAL_GROUPS.filter(
    (g) => (!family || g.family === family) && (!only || only.split(",").includes(g.id)),
  );
}
