/**
 * The FR catalogue's « menus » slice — the SOURCE language.
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/menus.ts`), no more and no less, slice by slice — so a forgotten
 * key names ITS slice rather than the whole catalogue.
 */
import type { Messages } from "../messages";

export const menus = {
  selection: {
    ariaLabel: "Actions sur la sélection",
    redact: "Redact",
    redactTip: "Redact la sélection",
    clarify: "Préciser",
    clarifyTip: "Demander des précisions",
    remember: "Retenir",
    rememberTip: (brand) =>
      `Retenir dans la Mémoire — ${brand} s'en souviendra dans vos prochaines conversations`,
    rememberAria: "Retenir dans la Mémoire",
    scopeAria: "Portée du redaction",
    scopeConversation: "Cette conversation",
    scopeVault: "Coffre (toujours)",
    typeEyebrow: "Type de donnée",
  },
  link: {
    ariaLabel: "Ouvrir le lien",
    integratedBrowser: "Navigateur intégré",
    externalBrowser: "Navigateur externe",
  },
  skills: {
    actions: "Actions",
    competences: "Compétences",
    empty: "Aucune compétence — vos prompts réutilisables, insérés en un clic.",
    create: "Créer une compétence",
  },
  docView: {
    changeAria: "Changer de vue",
    listAria: "Vue du document",
    currentTip: (view) => `Vue : ${view}`,
  },
  download: {
    ariaLabel: "Formats de téléchargement",
  },
  markKeep: {
    keep: "Garder en clair",
    keepTip: "Ne PAS redact cet élément pour cet envoi — il partira tel quel au modèle",
    uncertain: (brand) => `Détection à vérifier — ${brand} n'est pas sûr`,
  },
  page: {
    moreActions: "Plus d'actions",
    exportMemory: "Exporter (diagnostic)",
    exportMemoryTip: "Exporter la mémoire et ses liens en texte (fichier local, données réelles)",
  },
} satisfies Messages["menus"];

export const downloads = {
  pdf: { label: "PDF", hint: "Mise en page conservée, prêt à imprimer" },
  docx: { label: "Word", hint: "Document .docx, modifiable" },
  md: { label: ".md", hint: "Markdown — la source du document" },
  txt: { label: ".txt", hint: "Texte brut, sans mise en forme" },
} satisfies Messages["downloads"];

export const docViews = {
  image: "Image",
  pdfRedacted: "Pages redacted",
  pdfRedactedHint: "Les pages, fausses valeurs peintes dessus",
  sheet: "Feuille",
  presentation: "Présentation",
  document: "Document",
  rendered: "Rendu",
  original: "Original",
  originalHint: "Le fichier tel quel, avant redaction",
  redacted: "Redacted",
  redactedHint: "Ce qui quittera la machine",
  ocr: "Texte de l'image",
  ocrHint: "Ce que disent les pixels de la page",
} satisfies Messages["docViews"];
