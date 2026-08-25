import type { ReactNode } from "react";

/**
 * THE in-chat agent container — the shared shell every card the agent renders inside a
 * conversation is built from (design kit `AgentCard`): an accent stripe down the left
 * edge, a glyph TILE, a mono EYEBROW, the body, and a recessed FOOTER holding the note +
 * actions. One shell, so the four containers (action confirmation, integration proposal,
 * credits, web-nav reveal) read as one family instead of four bespoke boxes.
 *
 * Presentation only — every card keeps its own logic (and, for the confirmation gates,
 * its blocking-await contract with the agent loop).
 */
export function AgentCard({
  /** The left stripe. NEUTRAL by default: a card is chrome, and the `--hl-*` palette is
   *  the redaction's colour language — a violet proposal beside a violet redaction mark
   *  says the two are related, which they are not. Pass a colour only to say a STATE
   *  (`--brand` once resolved, `--red-500` on a failure). */
  stripe = "var(--border-strong)",
  tile,
  eyebrow,
  children,
  footer,
  className = "",
  role,
  ariaLabel,
}: {
  stripe?: string;
  tile?: ReactNode;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  role?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={`agent-card ${className}`.trim()} role={role} aria-label={ariaLabel}>
      {/* Runtime-computed hue (per state / per connector) — the one inline-style case
          rule 6 allows. Everything else is a class. */}
      <span className="agent-card-stripe" style={{ background: stripe }} />
      <div className="agent-card-body">
        {tile}
        <div className="agent-card-main">
          {eyebrow && <div className="cv-eyebrow agent-card-eyebrow">{eyebrow}</div>}
          {children}
        </div>
      </div>
      {footer && <div className="agent-card-footer">{footer}</div>}
    </div>
  );
}

/** The card's icon/glyph tile — neutral like the shell it sits in. `bg`/`color` are
 *  per-state and runtime-computed, hence inline (rule 6); a pair is a PAIR, so anything
 *  passed must bring its own readable ink (never a frozen hex — root rule 12). */
export function GlyphTile({
  children,
  bg = "var(--surface-sunken)",
  color = "var(--text-strong)",
  small = false,
}: {
  children: ReactNode;
  bg?: string;
  color?: string;
  /** Compact 34px variant (the multi-integration tiles) — the default 38px shell tile
   *  overwhelms a dense 2-per-row grid. */
  small?: boolean;
}) {
  return (
    <span className={`agent-card-tile${small ? " sm" : ""}`} style={{ background: bg, color }}>
      {children}
    </span>
  );
}

/** The card's headline — lime marker-pen highlight, dropped once the card resolves. */
export function AgentCardTitle({ children, marked = true }: { children: ReactNode; marked?: boolean }) {
  return (
    <div className="agent-card-title">
      <span className={marked ? "om-mark" : undefined}>{children}</span>
    </div>
  );
}

/** The card's secondary line under the title. */
export function AgentCardDesc({ children }: { children: ReactNode }) {
  return <div className="agent-card-desc">{children}</div>;
}
