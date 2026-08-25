import type { ReactNode } from "react";

/**
 * The signature marker title — the lime redaction highlight every modal
 * head carries. The inner <span> is what gets marked (not the heading box), so a
 * wrapped title paints the marker on each line rather than one smear across the
 * break; see `.modal-title` in ../../styles/modals.css.
 *
 * `marker={false}` drops the highlight for a head that already carries the accent
 * elsewhere — « Votre avis » has its lime glyph beside the title, and two lime
 * blocks side by side read as an error rather than as a signature.
 *
 * `size` is a runtime value (each modal head sizes its own title), so it stays
 * inline — the sanctioned exception to rule 6.
 */
export function ModalTitle({
  children,
  size = "var(--text-xl)",
  as: Tag = "h2",
  marker = true,
}: {
  children: ReactNode;
  /** Any CSS length/var. Defaults to the standard modal head size. */
  size?: string;
  /** The heading level — pick the one that fits the surrounding outline. */
  as?: "h1" | "h2" | "h3";
  /** Paint the lime marker behind the words. `false` = plain ink. */
  marker?: boolean;
}) {
  return (
    <Tag
      className={`cv-display modal-title${marker ? "" : " no-marker"}`}
      style={{ fontSize: size }}
    >
      <span>{children}</span>
    </Tag>
  );
}
