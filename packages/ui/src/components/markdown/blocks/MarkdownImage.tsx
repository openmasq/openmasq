import { useContext, useState, type Ref } from "react";
import { MarkdownDocContext } from "../context";
import { useStoredImage } from "../../media/MessageImage";
import { useInView } from "../../../hooks/useInView";

/**
 * An image inside a Markdown reply. Two sources, two components (so no hook is ever
 * called conditionally):
 *
 *  - **A STORED file referenced by BARE NAME** — `![Évolution](chart.png)`, which is how a
 *    model puts a figure it generated with `run_python` INSIDE a ```document. Resolved via
 *    `useStoredImage` (name → the conversation's stored bytes → a `data:` URL), so it
 *    displays in the card AND can be embedded in the PDF export. `data-file` carries the
 *    name so `export/documentBlocks.ts` can re-load the FULL-resolution bytes for print.
 *  - **A URL** (a relayed web-session thumbnail, or an inline `data:`) — rendered as-is.
 *
 * Both show a shimmering skeleton until they load and collapse cleanly on failure, so the
 * layout never jumps.
 */

/** A bare filename (no scheme, no path) — an attachment reference, not a URL. */
export function isStoredImageName(src: string): boolean {
  return /^[^/\\:?#]+\.(png|jpe?g|gif|webp|avif)$/i.test(src);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function MarkdownImage({ node: _node, src, alt, ...rest }: any) {
  const { imageIds } = useContext(MarkdownDocContext);
  if (typeof src === "string" && imageIds?.length && isStoredImageName(src)) {
    return <StoredImage name={src} alt={alt} ids={imageIds} />;
  }
  return <UrlImage src={src} alt={alt} {...rest} />;
}

/** A stored attachment by name. The DB read + decode are gated on VISIBILITY (like the
 *  inline chat images), so an off-screen document loads no bytes. */
function StoredImage({ name, alt, ids }: { name: string; alt?: string; ids: string[] }) {
  const [ref, inView] = useInView<HTMLElement>();
  const state = useStoredImage(name, ids, inView);
  if (state.status !== "ready") {
    return (
      <span
        ref={ref as Ref<HTMLSpanElement>}
        className={`md-img is-${state.status === "error" ? "failed" : "loading"}`}
      >
        {state.status === "loading" && <span className="md-img-skeleton" aria-hidden="true" />}
      </span>
    );
  }
  return (
    <span ref={ref as Ref<HTMLSpanElement>} className="md-img is-loaded">
      <img src={state.src} alt={alt ?? ""} data-file={name} />
    </span>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function UrlImage({ src, alt, ...rest }: any) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">(src ? "loading" : "failed");
  return (
    <span className={`md-img is-${state}`}>
      {state === "loading" && <span className="md-img-skeleton" aria-hidden="true" />}
      <img
        {...rest}
        src={src}
        alt={alt ?? ""}
        loading="lazy"
        onLoad={() => setState("loaded")}
        onError={() => setState("failed")}
      />
    </span>
  );
}
