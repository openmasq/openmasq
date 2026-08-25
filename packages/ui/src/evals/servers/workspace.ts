import { str, type FakeServer } from "./kit";

// The workspace fleet: local filesystem, Google Drive (read), Google Agenda.
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
