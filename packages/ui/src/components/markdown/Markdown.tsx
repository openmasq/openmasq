import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { CodeBlock } from "./blocks/CodeBlock";
import { MarkdownMark } from "./blocks/MarkdownMark";
import { InTableContext, MarkdownDocContext } from "./context";
import { rehypeRedact } from "./logic/rehypeRedact";
import { KATEX_OPTIONS, normalizeMath, useKatexPlugin, type KatexPlugin } from "./logic/katex";
import { MarkdownImage } from "./blocks/MarkdownImage";
import { TableScroll } from "./blocks/TableScroll";
import { MarkdownLink } from "./blocks/MarkdownLink";
import type { ProposedSkill } from "../../suggestions/proposedSkill";

// `MarkdownDocContext` is re-exported so existing importers (e.g. DocumentCard) keep
// `import { MarkdownDocContext } from "./Markdown"`.
export { MarkdownDocContext };

/** How many images a paragraph holds, IF it holds nothing but images (ignoring
 *  whitespace / soft breaks). 0 when it has any real non-image content — so only
 *  pure image runs (ChatGPT's results grid) become a mosaic, not prose with an
 *  inline image. */
function imageOnlyCount(node: any): number {
  if (!node?.children) return 0;
  let imgs = 0;
  for (const c of node.children) {
    if (c.type === "element" && c.tagName === "img") imgs++;
    else if (c.type === "element" && c.tagName === "br") continue;
    else if (c.type === "text" && !c.value.trim()) continue;
    else return 0;
  }
  return imgs;
}

interface Props {
  content: string;
  vault?: Record<string, string>;
  kinds?: Record<string, string>;
  /** Values suspended (revealed) for this conversation — marks render dimmed. */
  revealed?: Set<string>;
  /** Fetch + show the OpenGraph preview in the link hover-popover (opt-in). */
  linkPreviews?: boolean;
  /** Persist a `DocumentCard` edit into this content's ```document fence (absent ⇒
   *  the card is read-only — a streaming bubble, a nested render, mobile preview). */
  onDocumentEdit?: (oldText: string, newText: string) => Promise<boolean>;
  /** Platform HTML→PDF typesetter for a `DocumentCard` download (absent ⇒ pdf-lib). */
  renderPdf?: (doc: { html: string; css: string; title: string }) => Promise<Uint8Array>;
  /** Conversation storage ids, so `![](chart.png)` resolves to the stored figure. */
  imageIds?: string[];
  /** Full-resolution re-load of a stored image, for the export (absent ⇒ the preview). */
  loadImage?: (name: string) => Promise<string | null>;
  /** Adopt a proposed skill/workflow (absent ⇒ the card is read-only). */
  onAddSkill?: (skill: ProposedSkill) => boolean;
  isSkillAdded?: (skill: ProposedSkill) => boolean;
}


function MarkdownImpl({
  content,
  vault,
  kinds,
  revealed,
  linkPreviews,
  onDocumentEdit,
  renderPdf,
  imageIds,
  loadImage,
  onAddSkill,
  isSkillAdded,
}: Props) {
  const katex = useKatexPlugin();
  // Stable value so a `DocumentCard` (context consumer) doesn't re-render on every
  // streamed word — vault/kinds/revealed are already stable refs from MessageBubble.
  const docCtx = useMemo(
    () => ({ vault, kinds, revealed, onDocumentEdit, renderPdf, imageIds, loadImage, onAddSkill, isSkillAdded }),
    [vault, kinds, revealed, onDocumentEdit, renderPdf, imageIds, loadImage, onAddSkill, isSkillAdded],
  );
  return (
    <MarkdownDocContext.Provider value={docCtx}>
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          // `KATEX_OPTIONS` carries the whole policy — inert on malformed/partial LaTeX,
          // and the size/expansion/trust bounds that keep MODEL-authored math from
          // wrecking the layout or minting links (see logic/katex.ts).
          // KaTeX is lazy-loaded (see useKatexPlugin); until it lands, math renders
          // as raw LaTeX text rather than blocking the launch bundle.
          ...(katex
            ? [[katex, KATEX_OPTIONS] as [KatexPlugin, Record<string, unknown>]]
            : []),
          rehypeRedact(vault, kinds, revealed),
        ]}
        components={{
          // External links open in the system browser (Electron handles target).
          // `title={href}` reveals the real destination on hover (a bare label like
          // "Option 1" otherwise hides where it points); right-click → copy/open is
          // wired via the main-process context menu.
          a: ({ node: _node, ...props }: any) => (
            <MarkdownLink {...props} previewEnabled={linkPreviews} />
          ),
          // Links inside a table get NO preview card (it would break the column
          // layout) — flag the whole subtree via context; `MarkdownLink` reads it.
          table: ({ node: _node, ...props }: any) => (
            <InTableContext.Provider value={true}>
              {/* Scroll box so the table FILLS the text column (width:100%) yet
                  scrolls when its content is genuinely wider — with an edge-fade
                  affordance so the user SEES it's scrollable (macOS overlay bars
                  hide until you scroll → "impossible de slider" otherwise). */}
              <TableScroll>
                <table {...props} />
              </TableScroll>
            </InTableContext.Provider>
          ),
          // Fenced code blocks get a header (language label + accent + copy).
          pre: CodeBlock,
          // Redaction marks — a LOCAL file path the platform can open gains a small
          // « ouvrir dans le panneau » icon on its left (see MarkdownMark's gates).
          mark: MarkdownMark,
          // Remote reply images get a loading skeleton (see MarkdownImage).
          img: MarkdownImage,
          // A paragraph that's nothing but images (ChatGPT's results grid) is
          // laid out as a thumbnail mosaic instead of full-width stacked images.
          p: ({ node, children, ...props }: any) =>
            imageOnlyCount(node) >= 2 ? (
              <div className="md-gallery">{children}</div>
            ) : (
              <p {...props}>{children}</p>
            ),
        }}
      >
        {normalizeMath(content)}
      </ReactMarkdown>
    </div>
    </MarkdownDocContext.Provider>
  );
}

// Memoized: re-parsing markdown → rehype → React (+ KaTeX) is expensive, so skip
// it when `content`/`vault`/`kinds` are unchanged (shallow compare). MessageBubble's
// own memo already gates this on the typing path; this is defence for other callers.
export const Markdown = memo(MarkdownImpl);
