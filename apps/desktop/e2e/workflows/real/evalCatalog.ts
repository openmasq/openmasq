import { BRAND } from "@openmasq/branding";
import type { LabPrompt } from "./lab";

/*
 * THE EVALUATION CATALOG — what agentic reliability is measured against.
 *
 * Two families, deliberately separated:
 *  • SIMPLE  — one intent, one connector. Serves as the FLOOR: if a model fails
 *              there, nothing else matters.
 *  • COMPLEX — several connectors AND CHAINING: one tool's output is
 *              the next one's input (a Sentry error becomes a ticket, a
 *              Stripe figure becomes an email). That's where agentic loops
 *              really break, and so that's where the guidance is judged.
 *
 * Each group declares its connectors: one group = one app = one short
 * tool catalog. The same catalog serves BOTH BENCHES — fixtures (free,
 * deterministic) and e2e (real servers) — so the numbers are comparable.
 *
 * ⚠️ DECLARED CONNECTORS MUST ACTUALLY BE CONNECTED. An OAuth entry
 * in the store proves nothing: Tavily, Stripe and Attio each had one and weren't
 * connecting — the groups that cited them ran without them and
 * produced numbers that measured nothing (a "no tool called" outcome was
 * even mistaken for a routing failure when the service was simply absent).
 * `assertConnectorsAvailable` now fails loudly; this catalog only cites
 * services verified connected on the dev account.
 *
 * ⚠️ WRITES DECLARE THEMSELVES. `approveWrites` defaults to `false` (`lab.ts`):
 * only a prompt whose write IS the point being measured carries `approveWrites: true`.
 * The reverse — approve unless stated otherwise — let the model post an
 * invented event to the REAL calendar on `prep-journee`, a scenario nonetheless annotated "Read
 * only", and the bench counted it as a success (27/07/2026 log).
 *
 * ⚠️ NEON IS READ-ONLY, no exceptions: `approveWrites: false` stays written
 * explicitly on every prompt that approaches it — redundant with the default, and that's
 * deliberate: the constraint must be readable on the prompt, not inferred from an absence.
 */

/** The only recipient allowed for a test send — the brand's support
 *  address (`branding.json`), never a literal that would survive a zone change. */
export const TEST_RECIPIENT = BRAND.supportEmail;

export interface EvalGroup {
  id: string;
  /** The ONLY connectors reconnected (`OPENMASQ_E2E_MCP_ONLY`) / served as fixtures. */
  connectors: string[];
  /** Expected tool prefix before sending — a deterministic sync point. */
  needsTool: string;
  /** `complexe` = multi-connector chaining (the heart of the bench). */
  family: "simple" | "complexe";
  prompts: LabPrompt[];
}

/* ── SIMPLE FAMILY: the floor ───────────────────────────────────────────── */

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
        // INTENDED write: this scenario measures it, so it allows it.
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
        // INTENDED write: this scenario measures it, so it allows it.
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
        // INTENDED write: this scenario measures it, so it allows it.
        approveWrites: true,
      },
    ],
  },
];

/* ── COMPLEX FAMILY: multi-tool chaining ────────────────────────────── */

const COMPLEXE: EvalGroup[] = [
  {
    // The incident chain, the one from the `tofix/` folder: notice → trace →
    // prevent. Three connectors, TWO outbound writes, and a data
    // hand-off (the error id must show up in the ticket then the message).
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
        // INTENDED write: this scenario measures it, so it allows it.
        approveWrites: true,
      },
    ],
  },
  {
    // The crossing of TWO heterogeneous sources (product usage vs technical health)
    // followed by a written summary. Tests the ability to NOT loop on one source
    // when the other suffices, and to produce a deliverable.
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
        // INTENDED write: this scenario measures it, so it allows it.
        approveWrites: true,
      },
    ],
  },
  {
    // Billing → follow-up: the path most loaded with PII (a failed payment
    // carries the name AND the email of a customer). The email must go out to the
    // test address, NEVER to the customer found in the tool — that's the key assertion.
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
        // INTENDED write: this scenario measures it, so it allows it.
        approveWrites: true,
      },
    ],
  },
  {
    // The fan-out: three sources read in parallel for ONE summary answer.
    // Read-only — measures breadth (did it consult all three?) more than
    // depth, and penalizes models that lock onto a single source.
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
    // Watch → deliverable → distribution. Three connectors, two writes, and a
    // strict dependency: the Doc's link must appear in the Slack message.
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
        // INTENDED write: this scenario measures it, so it allows it.
        approveWrites: true,
      },
    ],
  },
  {
    // ⚠️ NEON READ-ONLY. The database ↔ billing crossing is the product's worst
    // PRIVACY case: both tools return real addresses, which
    // must go back to the model REDACTED. The deliverable is LOCAL (run_python),
    // never a DB write — `approveWrites: false` is now the default,
    // and stays written here so the constraint reads on the prompt.
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
    // CRM → calendar → email: the sales chain, three connectors and one
    // write. Tests carrying a read context (the prospect) into a deliverable.
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
        // INTENDED write: this scenario measures it, so it allows it.
        approveWrites: true,
      },
    ],
  },
  {
    // Figures → spreadsheet: the output must be STRUCTURED (no prose), which
    // traps models that answer instead of calling the write tool.
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
        // INTENDED write: this scenario measures it, so it allows it.
        approveWrites: true,
      },
    ],
  },
];

export const EVAL_GROUPS: EvalGroup[] = [...SIMPLE, ...COMPLEXE];

/** Selection by family / id, via `E2E_EVAL_FAMILY` + `E2E_EVAL_ONLY`. */
export function selectGroups(family?: string, only?: string): EvalGroup[] {
  return EVAL_GROUPS.filter(
    (g) => (!family || g.family === family) && (!only || only.split(",").includes(g.id)),
  );
}
