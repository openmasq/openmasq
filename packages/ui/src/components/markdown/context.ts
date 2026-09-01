import { createContext } from "react";

// Shared Markdown render contexts, split out of Markdown.tsx so the sub-components
// (MarkdownLink, TableScroll) and the orchestrator can all reference them without a cycle.

/** True for links rendered INSIDE a Markdown table: an inline block card would blow
 *  out the cell/column layout (a "deploy URL" column becomes unreadable), so a link
 *  in a table gets NO preview card (and never fetches one) — just the truncated link. */
export const InTableContext = createContext(false);

/** The enclosing message's redaction vault/kinds/revealed, so a nested renderer — a
 *  `DocumentCard` re-rendering the ```document body as Markdown — keeps the redaction
 *  highlighting (the marks) consistent with the rest of the reply. Default empty so a
 *  `CodeBlock`/`DocumentCard` rendered outside a Markdown (tests) still works.
 *  `onDocumentEdit` (absent ⇒ read-only card) persists a DocumentCard edit into the
 *  enclosing message's ```document fence — threaded from the store, returns false
 *  when the fence can't be located (the card shows the failure, content untouched). */
export const MarkdownDocContext = createContext<{
  vault?: Record<string, string>;
  kinds?: Record<string, string>;
  revealed?: Set<string>;
  onDocumentEdit?: (oldText: string, newText: string) => Promise<boolean>;
  /** The platform's HTML→PDF typesetter, injected the same way (this tier must not read
   *  the host — see `../CLAUDE.md`). Absent ⇒ the card's PDF is built with pdf-lib. */
  renderPdf?: (doc: { html: string; css: string; title: string }) => Promise<Uint8Array>;
  /** The enclosing message's conversation storage ids, so a `![](chart.png)` in the reply
   *  resolves to the STORED file (a figure the model generated). Absent ⇒ a bare name
   *  stays an unresolvable src and the image collapses, as before. */
  imageIds?: string[];
  /** Re-load a stored image at FULL resolution for the export (screen previews are
   *  downscaled; print needs the original). Absent ⇒ the export embeds the preview. */
  loadImage?: (name: string) => Promise<string | null>;
  /** Adopt the skill / workflow a `SkillCard` proposes — returns `true` when
   *  the entry was actually created (the button then freezes on « Ajouté »). ABSENT ⇒ the
   *  card is read-only, like `onDocumentEdit`: bubble in stream, nested
   *  render, preview. Nothing is ever added without this click (`SkillCard`). */
  onAddSkill?: (skill: import("../../suggestions/proposedSkill").ProposedSkill) => boolean;
  /** « Déjà dans la liste ? » — the adoption button's state, DERIVED from the data: the
   *  message list is virtualized, an instance state re-arms on remount. */
  isSkillAdded?: (skill: import("../../suggestions/proposedSkill").ProposedSkill) => boolean;
}>({});
