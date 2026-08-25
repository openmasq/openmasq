import { str, type FakeServer } from "./kit";

// The workflows fleet: Fireflies, Linear, Asana, Stripe payments — the connectors the
// COMPLEX multi-tool scenarios chain across. Names/schemas track the vendors' hosted
// MCP servers (same transcription as `apps/desktop/e2e/fixtures/mcp/workflows.json`);
// results are fixtures on the same Karl Studio theme as the rest of the fleet.

export const FIREFLIES: FakeServer = {
  id: "fireflies",
  tools: [
    {
      name: "fireflies_get_transcripts",
      description: "Lister les transcriptions de réunions récentes (titre, date, durée, id).",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Nombre de transcriptions (défaut 10)." },
          from_date: str("Date ISO de début (optionnel)"),
          to_date: str("Date ISO de fin (optionnel)"),
        },
      },
      result:
        "1. « Point Karl Studio » — hier, 42 min (id: tr-981)\n2. « Revue budget » — il y a 6 jours, 31 min (id: tr-955)",
    },
    {
      name: "fireflies_get_transcript_details",
      description: "Résumé, décisions et actions d'une transcription par son id.",
      inputSchema: {
        type: "object",
        properties: { transcript_id: str("Id de la transcription (voir fireflies_get_transcripts)") },
        required: ["transcript_id"],
      },
      result:
        "« Point Karl Studio » (hier, 42 min). Résumé : le devis signé passe en production, pilote en septembre. Actions : 1) Jean Vannec envoie le planning révisé ; 2) préparer la démo client pour jeudi.",
    },
  ],
};

export const LINEAR: FakeServer = {
  id: "linear",
  tools: [
    {
      name: "list_issues",
      description: "Lister les issues Linear du cycle en cours (état, assigné, blocages).",
      inputSchema: {
        type: "object",
        properties: {
          team: str("Clé ou nom d'équipe (optionnel)"),
          state: str("Filtre d'état (optionnel)"),
          limit: { type: "number", description: "Nombre de résultats (défaut 25)." },
        },
      },
      result:
        "Cycle 14 — 5 issues :\n- NUM-228 Export CSV [Done]\n- NUM-231 Refonte onboarding [In Progress]\n- NUM-229 Intégration API partenaire [Blocked] — en attente du partenaire",
    },
  ],
};

export const ASANA: FakeServer = {
  id: "asana",
  tools: [
    {
      name: "asana_create_task",
      description: "Créer une tâche Asana. `name` est le titre ; `due_on` une date AAAA-MM-JJ. Action d'écriture.",
      inputSchema: {
        type: "object",
        properties: {
          name: str("Titre de la tâche"),
          due_on: str("Échéance (AAAA-MM-JJ), optionnel"),
          notes: str("Description, optionnel"),
        },
        required: ["name"],
      },
      result: "Tâche créée (gid: 120983447) dans « Mes tâches ».",
    },
  ],
};

/** Stripe PAYMENTS view (list_payment_intents, the hosted MCP's read) — distinct from
 *  the generic `STRIPE` read/write pair in `saas.ts`; same real connector id. */
export const STRIPE_PAYMENTS: FakeServer = {
  id: "stripe",
  tools: [
    {
      name: "list_payment_intents",
      description: "Lister les paiements (PaymentIntents) du compte Stripe, les plus récents d'abord.",
      inputSchema: {
        type: "object",
        properties: {
          customer: str("Id client pour filtrer (optionnel)"),
          limit: { type: "number", description: "Nombre de résultats (défaut 10)." },
        },
      },
      result:
        '[{"id":"pi_3Rf8Kx","amount":420000,"currency":"eur","status":"succeeded","description":"Facture INV-2093 — Karl Studio","created":"il y a 4 jours"},{"id":"pi_3Re2Ma","amount":75000,"currency":"eur","status":"succeeded","description":"Acompte — Atelier Torbel","created":"il y a 11 jours"}]',
    },
  ],
};
