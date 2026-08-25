import { runCss } from "../ooxml/textStyle";
import { useContainerWidth } from "../../../../hooks/useContainerWidth";
import type { PptxDeck, PptxPara, PptxShape, PptxSlide } from "./pptxModel";
import {
  bulletFor,
  frameCss,
  paraCss,
  slideBoxCss,
  slidePlaneCss,
  slideScale,
  textShapeCss,
} from "./pptxLayout";

// Model → React. Presentational; the geometry maths is in `pptxLayout.ts` and the
// scaling rationale is documented there.
//
// As with the docx viewer, there is no `dangerouslySetInnerHTML`: the tags below are
// the complete set a .pptx can produce on screen. See `../docx/docxModel.ts`.

function Para({ para, autoNumIndex }: { para: PptxPara; autoNumIndex: number }) {
  const bullet = bulletFor(para, autoNumIndex);
  return (
    <p className="pptxv-p" style={paraCss(para)}>
      {/* The bullet is presentation, not content: `aria-hidden` + its own element keeps
          it out of the accessible name AND makes it obvious it is not part of a
          selection over the slide's text. */}
      {bullet && (
        <span className="pptxv-bullet" aria-hidden="true">
          {bullet}{" "}
        </span>
      )}
      {para.runs.map((run, i) => (
        <span key={i} style={runCss(run)}>
          {run.text}
        </span>
      ))}
    </p>
  );
}

function Shape({ shape }: { shape: PptxShape }) {
  if (shape.kind === "image") {
    return (
      <img
        className="pptxv-img"
        src={shape.src}
        alt={shape.alt ?? ""}
        // Runtime-computed per-shape geometry from the deck (the sanctioned inline-style
        // case, rule 6).
        style={frameCss(shape.frame)}
      />
    );
  }
  // An auto-numbered list restarts per shape and counts only the paragraphs that
  // actually carry a number — the renderer is the only place that can know the index.
  let n = 0;
  return (
    <div className="pptxv-text" style={textShapeCss(shape)}>
      {shape.paras.map((para, i) => {
        if (para.bullet === "#") n += 1;
        return <Para key={i} para={para} autoNumIndex={n} />;
      })}
    </div>
  );
}

function Slide({ slide, deck, scale, index }: { slide: PptxSlide; deck: PptxDeck; scale: number; index: number }) {
  return (
    <div className="pptxv-slide-wrap">
      <div className="pptxv-num">Diapositive {index + 1}</div>
      <div className="pptxv-slide" style={slideBoxCss(deck.widthPx, deck.heightPx, scale)}>
        <div
          className="pptxv-plane"
          style={{
            ...slidePlaneCss(deck.widthPx, deck.heightPx, scale),
            ...(slide.background ? { background: slide.background } : undefined),
          }}
        >
          {/* Document order IS z-order — never sort these. */}
          {slide.shapes.map((shape, i) => (
            <Shape key={i} shape={shape} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** The parsed deck, rendered one slide per card at the deck's true aspect ratio. The
 *  text is ordinary DOM text, so it is natively selectable. */
export function PptxRender({ deck }: { deck: PptxDeck }) {
  const { ref, availWidth } = useContainerWidth();
  const scale = slideScale(deck.widthPx, availWidth);
  return (
    <div className="pptxv" ref={ref}>
      {deck.slides.map((slide, i) => (
        <Slide key={i} slide={slide} deck={deck} scale={scale} index={i} />
      ))}
    </div>
  );
}
