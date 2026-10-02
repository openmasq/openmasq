/**
 * The EN catalogue's « menus » slice — translated from the source (`../fr/`).
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/menus.ts`), no more and no less, slice by slice — so a forgotten
 * key names ITS slice rather than the whole catalogue.
 */
import type { Messages } from "../messages";

export const menus = {
  selection: {
    ariaLabel: "Selection actions",
    redact: "Mask",
    redactTip: "Mask the selection",
    clarify: "Clarify",
    clarifyTip: "Ask for details",
    remember: "Remember",
    rememberTip: (brand) =>
      `Save to Memory. ${brand} will recall it in your next conversations`,
    rememberAria: "Save to Memory",
    scopeAria: "Masking scope",
    scopeConversation: "This conversation",
    scopeVault: "All conversations (Vault)",
    typeEyebrow: "Data type",
  },
  link: {
    ariaLabel: "Open link",
    integratedBrowser: "Built-in browser",
    externalBrowser: "External browser",
  },
  skills: {
    actions: "Actions",
    heading: "Skills",
    empty: "No skills yet. Save reusable prompts and insert them in one click.",
    create: "Create skill",
  },
  docView: {
    changeAria: "Change view",
    listAria: "Document view",
    currentTip: (view) => `View: ${view}`,
  },
  download: {
    ariaLabel: "Download formats",
  },
  markKeep: {
    uncertain: (brand) => `Low-confidence detection by ${brand}. Please check it.`,
  },
  page: {
    moreActions: "More actions",
    exportMemory: "Export (diagnostic)",
    exportMemoryTip: "Export memory and its links as a text file. The file contains real, unmasked values.",
  },
} satisfies Messages["menus"];

export const downloads = {
  pdf: { label: "PDF", hint: "Layout preserved, ready to print" },
  docx: { label: "Word", hint: "Editable .docx document" },
  md: { label: ".md", hint: "Markdown source of the document" },
  txt: { label: ".txt", hint: "Plain text, no formatting" },
} satisfies Messages["downloads"];

export const docViews = {
  image: "Image",
  pdfRedacted: "Masked pages",
  pdfRedactedHint: "The pages, with substitutes in place of the real values",
  sheet: "Sheet",
  presentation: "Presentation",
  document: "Document",
  rendered: "Rendered",
  original: "Original",
  originalHint: "The file as is, before masking",
  redacted: "Masked",
  redactedHint: "What the model receives",
  ocr: "Text in the image",
  ocrHint: "Text recognized in the page image",
} satisfies Messages["docViews"];
