/**
 * Tranche « menus » du catalogue EN — traduit de la source (`../fr/`).
 *
 * `satisfies` par entrée : le compilateur exige EXACTEMENT les clés du contrat
 * (`../messages/menus.ts`), ni plus ni moins, tranche par tranche — donc une clé
 * oubliée nomme SA tranche plutôt que le catalogue entier.
 */
import type { Messages } from "../messages";

export const menus = {
  selection: {
    ariaLabel: "Actions on the selection",
    redact: "Mask",
    redactTip: "Mask the selection",
    clarify: "Clarify",
    clarifyTip: "Ask for details",
    remember: "Remember",
    rememberTip: (brand) =>
      `Keep this in Memory — ${brand} will recall it in your next conversations`,
    rememberAria: "Keep this in Memory",
    scopeAria: "Scope of the masking",
    scopeConversation: "This conversation",
    scopeVault: "Vault (always)",
    typeEyebrow: "Kind of data",
  },
  link: {
    ariaLabel: "Open the link",
    integratedBrowser: "Built-in browser",
    externalBrowser: "External browser",
  },
  skills: {
    actions: "Actions",
    competences: "Skills",
    empty: "No skills yet — your reusable prompts, inserted in one click.",
    create: "Create a skill",
  },
  docView: {
    changeAria: "Change the view",
    listAria: "Document view",
    currentTip: (view) => `View: ${view}`,
  },
  download: {
    ariaLabel: "Download formats",
  },
  markKeep: {
    keep: "Leave in clear",
    keepTip: "Do NOT mask this item for this send — it leaves as-is for the model",
    uncertain: (brand) => `Worth checking — ${brand} isn't sure about this one`,
  },
  page: {
    moreActions: "More actions",
    exportMemory: "Export (diagnostic)",
    exportMemoryTip: "Export the memory and its links as text (local file, real values)",
  },
} satisfies Messages["menus"];

export const downloads = {
  pdf: { label: "PDF", hint: "Layout preserved, ready to print" },
  docx: { label: "Word", hint: "A .docx document, editable" },
  md: { label: ".md", hint: "Markdown — the document's source" },
  txt: { label: ".txt", hint: "Plain text, no formatting" },
} satisfies Messages["downloads"];

export const docViews = {
  image: "Image",
  pdfRedacted: "Masked pages",
  pdfRedactedHint: "The pages, with fake values painted over them",
  sheet: "Sheet",
  presentation: "Presentation",
  document: "Document",
  rendered: "Rendered",
  original: "Original",
  originalHint: "The file as it is, before masking",
  redacted: "Masked",
  redactedHint: "What will leave the machine",
  ocr: "Text in the image",
  ocrHint: "What the pixels of the page say",
} satisfies Messages["docViews"];
