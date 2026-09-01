import { CONNECTORS } from "@openmasq/connectors";
import type { FakeServer, FakeTool } from "./kit";

// The DIRECT fleet, GENERATED from the real definitions (`@openmasq/connectors`) —
// names, descriptions and schemas faithful BY CONSTRUCTION (a tool added to the real
// connector appears here on its own). Only the RESULTS are fixtures (Karl
// Studio / Atelier Torbel theme), keyed `<connector>__<tool>`; a tool with no fixture returns
// a marked generic OK, VISIBLE in the transcripts without breaking a run.

const R: Record<string, string> = {
  // ── github (16 tools) ─────────────────────────────────────────────────────
  github__get_me: "Connecté en tant que zorvia-dev (Zorvia).",
  github__list_repos: "zorvia/app (TS, maj hier) · zorvia/site (Astro, maj lundi)",
  github__search_repos: "1 résultat : zorvia/app — application de bureau (TS).",
  github__get_repo: "zorvia/app — branche par défaut main, 2 issues ouvertes, 1 PR ouverte.",
  github__list_branches: "main · fix/export-pdf · feat/onboarding",
  github__list_commits: "a1b2c3 fix: export CSV Safari (hier) · d4e5f6 feat: onboarding mobile (lundi)",
  github__get_file: "README.md — « Zorvia app — build: pnpm build, tests: pnpm test »",
  github__list_issues: "Assignées à vous : #121 Lenteur du tableau de bord",
  github__list_repo_issues: "#118 Export CSV vide sur Safari · #121 Lenteur du tableau de bord",
  github__get_issue: "#118 — Export CSV vide sur Safari. Ouverte hier par claire-as. Repro : exporter > 1000 lignes.",
  github__search_issues: "1 résultat : #118 Export CSV vide sur Safari",
  github__list_pull_requests: "PR #97 « fix: export PDF » — ouverte, CI verte",
  github__get_pull_request: "PR #97 — corrige l'erreur 500 de l'export PDF ; +42/-7 ; prête à merger.",
  github__create_issue: "Issue #122 créée.",
  github__comment_issue: "Commentaire ajouté.",
  github__update_issue: "Issue mise à jour.",
  // ── google-calendar / gmail / drive: aligned with the manual fleet ────────
  "google-calendar__list_events":
    "jeu. 10:30 — Point Karl Studio (avec contact@karl-studio.fr) · ven. 14:00 — Revue budget",
  "google-calendar__create_event": "Événement créé : Suivi projet",
  gmail__search_messages:
    "Camille Vernay <contact@karl-studio.fr> — « Validation budget Q3 » (Wed, 22 Jul 2026 09:14:02 +0200)",
  gmail__list_recent:
    "contact@karl-studio.fr — « Validation budget Q3 » (hier) · compta@zorvia.fr — « Facture INV-2093 » (hier)",
  gmail__get_message:
    "De : Camille Vernay <contact@karl-studio.fr>\nObjet : Validation budget Q3\nDate : Wed, 22 Jul 2026 09:14:02 +0200\n\nBonjour,\n\nLe budget Q3 est validé côté Karl Studio (48 000 € HT). Pouvez-vous nous renvoyer le planning révisé avant vendredi ?\n\nCamille",
  gmail__send_email: "Email envoyé.",
  "google-drive__search_files": "Contrat Karl Studio 2026 — application/pdf (2026-07-21) · id:doc-77aa",
  "google-drive__list_folder":
    "[dossier] Clients · id:fld-12a3\n[dossier] Comptabilité · id:fld-8b90\nContrat Karl Studio 2026.pdf · id:doc-77aa",
  "google-drive__upload_file": "Fichier déposé sur Drive : « notes-reunion.md » (id up-42).",
  "google-drive__read_document":
    "# Contrat Karl Studio 2026\n\nDurée 24 mois, 48 000 € HT, préavis 60 jours. Contact commercial : contact@karl-studio.fr.",
  // ── google-docs / sheets / tasks / analytics ───────────────────────────────
  "google-docs__create_document": "Document créé : « Compte-rendu » (id doc-9f21).",
  "google-docs__read_document": "# Compte-rendu\n\nDécisions : pilote en septembre. Actions : planning révisé (Jean Vannec).",
  "google-docs__append_text": "Texte ajouté au document.",
  "google-sheets__read_range": "A1:C3 —\nclient\tmontant\tstatut\nKarl Studio\t18000\tpayé\nAtelier Torbel\t7500\ten attente",
  "google-sheets__append_row": "Ligne ajoutée.",
  "google-sheets__create_spreadsheet": "Classeur créé : « Suivi facturation » (id sh-3b77).",
  "google-tasks__list_tasks": "À faire : Relancer Atelier Torbel (ven.) · Préparer la démo client (jeu.)",
  "google-tasks__create_task": "Tâche créée.",
  "google-tasks__complete_task": "Tâche terminée.",
  "google-analytics__list_properties": "1 propriété GA4 : « zorvia.fr » (id 4471002).",
  "google-analytics__get_report":
    "7 derniers jours — sessions : 1 204 (+12 %) · pages vues : 3 877 · source top : recherche organique.",
  // ── slack (7 tools) ───────────────────────────────────────────────────────
  slack__list_channels: "#general · #ventes · #support · #design",
  slack__read_channel:
    "claire (cliente, claire@atelier-torbel.fr) : l'export PDF plante — erreur 500.\nmarc (support) : je remonte.",
  slack__read_thread: "claire : toujours l'erreur ce matin. · marc : correctif en cours de déploiement.",
  slack__list_users: "claire (Atelier Torbel) · marc (support) · jean (Karl Studio)",
  slack__get_user: "claire — cliente Atelier Torbel, claire@atelier-torbel.fr, fuseau Europe/Paris.",
  slack__search_messages: "1 résultat — #ventes, claire : « le devis Karl Studio est signé 🎉 »",
  slack__send_message: "Message envoyé.",
  // ── microsoft (outlook / onedrive / sharepoint / teams) ────────────────────
  "microsoft-outlook__search_messages":
    "Jean Vannec <jean.vannec@karl-studio.fr> — « Planning révisé » (hier 17:41)",
  "microsoft-outlook__list_recent":
    "jean.vannec@karl-studio.fr — « Planning révisé » (hier) · no-reply@teams — « Récap réunion » (hier)",
  "microsoft-outlook__get_message":
    "De : Jean Vannec <jean.vannec@karl-studio.fr>\nObjet : Planning révisé\nDate : hier 17:41\n\nBonjour,\n\nVoici le planning révisé : pilote en septembre, recette la première semaine d'octobre. Dites-moi si le jalon du 15/09 tient toujours.\n\nJean",
  "microsoft-outlook__send_email": "Email envoyé.",
  "microsoft-onedrive__search_files": "« Budget 2026.xlsx » (modifié lundi) · « Contrat Karl Studio.docx » (il y a 3 jours)",
  "microsoft-onedrive__list_folder":
    "[dossier] Documents · id:01ABC!101\nBudget 2026.xlsx · id:01ABC!204",
  "microsoft-onedrive__read_document": "# Budget 2026\n\nQ3 : matériel 12 400 €, prestation Karl Studio 48 000 € HT.",
  "microsoft-sharepoint__search_sites": "1 site : « Équipe Produit » (produit.sharepoint)",
  "microsoft-sharepoint__list_documents": "« Roadmap 2026.pptx » · « Specs export PDF.docx »",
  "microsoft-sharepoint__read_document": "# Specs export PDF\n\nLimite connue : > 1000 lignes → timeout (bug #118).",
  "microsoft-teams__list_teams": "Équipe Produit · Support clients",
  "microsoft-teams__list_channels": "Général · Incidents · Releases",
  "microsoft-teams__read_channel": "marc : incident export PDF en cours, correctif dans la release de jeudi.",
  "microsoft-teams__send_message": "Message envoyé.",
};

/** The generated direct fleet. `only` restricts to the requested ids (a scenario offers
 *  only what it declares); with no argument, ALL the package's direct connectors. */
export function directFleet(only?: string[]): FakeServer[] {
  return CONNECTORS.filter((c) => !only || only.includes(c.id)).map((c) => ({
    id: c.id,
    tools: c.tools.map(
      (t): FakeTool => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as Record<string, unknown>,
        result: R[`${c.id}__${t.name}`] ?? `OK — (fixture générique : ${c.id}__${t.name})`,
      }),
    ),
  }));
}

/** Direct tools with no dedicated fixture — the remaining coverage LIST, consulted
 *  by the parity test (empty = every direct tool has its fixture). */
export function directFixtureGaps(): string[] {
  return CONNECTORS.flatMap((c) =>
    c.tools.filter((t) => !(`${c.id}__${t.name}` in R)).map((t) => `${c.id}__${t.name}`),
  );
}
