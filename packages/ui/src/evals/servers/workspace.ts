import { str, type FakeServer } from "./kit";

// The workspace fleet: local filesystem, Qdrant, Google Drive (read), Google Agenda.
// Tool names track the real connectors (`packages/connectors/src/google/drive.ts`,
// `calendar.ts`) and the desktop's vetted stdio Filesystem server.

/** Local filesystem — read tools never confirm, `write_file` must. */
export const FILESYSTEM: FakeServer = {
  id: "filesystem",
  tools: [
    {
      name: "read_file",
      description: "Lire le contenu d'un fichier local (chemin absolu dans le dossier autorisé).",
      inputSchema: { type: "object", properties: { path: str("Chemin du fichier") }, required: ["path"] },
      result: (args) => `Contenu de ${String(args.path ?? "")} :\nBudget Q3 — client Karl Studio — total 18 000 €.`,
    },
    {
      name: "list_directory",
      description: "Lister les fichiers d'un dossier local autorisé.",
      inputSchema: { type: "object", properties: { path: str("Chemin du dossier") }, required: ["path"] },
      result: "budget-q3.md\ndevis-karl.pdf\nnotes.txt",
    },
    {
      name: "write_file",
      description: "Écrire (créer ou remplacer) un fichier local. Action destructive.",
      inputSchema: {
        type: "object",
        properties: { path: str("Chemin du fichier"), content: str("Contenu complet à écrire") },
        required: ["path", "content"],
      },
      result: "Fichier écrit.",
    },
  ],
};

/** Qdrant — the in-process connector (`apps/desktop/src/main/mcp/qdrant/`): the three reads
 *  never confirm; store is a write; update and both deletions are high-risk writes. */
const QID = "0b8e3c9a-4f3e-4d59-9c1b-2a4a5d7e9f10";
export const QDRANT: FakeServer = {
  id: "qdrant",
  tools: [
    {
      name: "qdrant-collections",
      description: "Liste les collections Qdrant disponibles, avec leur nombre d'entrées.",
      inputSchema: { type: "object", properties: {} },
      result: "- notes (par défaut) : 2 entrée(s)\n- veille : 14 entrée(s)",
    },
    {
      name: "qdrant-find",
      description: "Cherche dans une collection Qdrant les entrées les plus proches d'une question, par le sens. Renvoie leurs identifiants.",
      inputSchema: { type: "object", properties: { query: str("Ce qu'on cherche, en langage naturel.") }, required: ["query"] },
      result: `1. (pertinence 0.87) [${QID}] Karl Studio préfère être tutoyé.\n2. (pertinence 0.71) [42] Devis Karl Studio envoyé le 12/09.`,
    },
    {
      name: "qdrant-list",
      description: "Liste les entrées d'une collection Qdrant, page par page, avec leurs identifiants.",
      inputSchema: { type: "object", properties: {} },
      result: `- [${QID}] Karl Studio préfère être tutoyé.\n- [42] Devis Karl Studio envoyé le 12/09.\n(fin de la collection)`,
    },
    {
      name: "qdrant-store",
      description: "Enregistre une information dans une collection Qdrant pour la retrouver plus tard par le sens. Renvoie l'identifiant de l'entrée.",
      inputSchema: { type: "object", properties: { information: str("Le texte à enregistrer.") }, required: ["information"] },
      result: `Enregistré dans « notes » sous l'identifiant ${QID}.`,
    },
    {
      name: "qdrant-update",
      description: "Modifie une entrée existante : remplace son texte (ré-indexé par le sens) et/ou ses métadonnées. L'ancien contenu est perdu.",
      inputSchema: { type: "object", properties: { id: str("L'identifiant de l'entrée."), information: str("Le nouveau texte.") }, required: ["id"] },
      result: `Entrée ${QID} modifiée dans « notes ».`,
    },
    {
      name: "qdrant-delete",
      description: "Supprime définitivement des entrées d'une collection Qdrant, par leurs identifiants.",
      inputSchema: { type: "object", properties: { ids: { type: "array", items: { type: "string" } } }, required: ["ids"] },
      result: "1 entrée(s) supprimée(s) de « notes ».",
    },
    {
      name: "qdrant-delete-collection",
      description: "Supprime définitivement une collection Qdrant entière et tout son contenu.",
      inputSchema: { type: "object", properties: { collection: str("Le nom exact de la collection à supprimer.") }, required: ["collection"] },
      result: "Collection « veille » supprimée.",
    },
  ],
};

/** Google Drive — read-only connector (the real one is lecture seule). */
export const GDRIVE: FakeServer = {
  id: "google-drive",
  tools: [
    {
      name: "search_files",
      description: "Rechercher des fichiers dans le Drive de l'utilisateur par nom ou contenu.",
      inputSchema: { type: "object", properties: { query: str("Termes de recherche") }, required: ["query"] },
      result: '2 fichiers : "Contrat Karl Studio.docx" (modifié hier), "Budget 2026.xlsx" (modifié lundi)',
    },
    {
      name: "read_document",
      description: "Lire le contenu texte d'un document Drive (Docs/PDF/texte).",
      inputSchema: { type: "object", properties: { fileId: str("Id ou nom du fichier") }, required: ["fileId"] },
      result: "Contrat de prestation — entre Zorvia SAS et Karl Studio, représentée par Jean Vannec…",
    },
  ],
};

/** Google Agenda — list (read) + create (write). */
export const GCAL: FakeServer = {
  id: "google-calendar",
  tools: [
    {
      name: "list_events",
      description: "Lister les événements de l'agenda sur une période.",
      inputSchema: {
        type: "object",
        properties: { timeMin: str("Début (ISO)"), timeMax: str("Fin (ISO)") },
      },
      result: "2 événements : « Point Karl Studio » jeudi 10h (avec contact@karl-studio.fr) · « Revue budget » vendredi 14h",
    },
    {
      name: "create_event",
      description: "Créer un événement dans l'agenda de l'utilisateur (avec invités éventuels).",
      inputSchema: {
        type: "object",
        properties: {
          summary: str("Titre de l'événement"),
          start: str("Début (ISO)"),
          end: str("Fin (ISO)"),
          attendees: { type: "array", description: "E-mails des invités" },
        },
        required: ["summary", "start", "end"],
      },
      result: "Événement créé.",
    },
  ],
};
