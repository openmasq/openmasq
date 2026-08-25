import type { CSSProperties } from "react";
import { LockIcon } from "./icons/sections";
import { scopeOf } from "../../orgShares/scopes";

/**
 * One badge for every object that carries a sharing scope (coffre terms,
 * compétences): same glyph, same words, wherever scope is shown (design
 * source: ui_kits/chat-app `ScopeBadge`). The tone rides a runtime CSS var —
 * per-item colour from data, the sanctioned inline-style case.
 */
export function ScopeBadge({
  scope,
  size = "sm",
  locked,
}: {
  scope?: string;
  size?: "sm" | "md";
  locked?: boolean;
}) {
  const sc = scopeOf(scope);
  return (
    <span
      className={`om-scope is-${size}`}
      title={sc.note}
      style={{ "--scope-tone": `var(--hl-${sc.tone})` } as CSSProperties}
    >
      <span className="om-scope-dot" />
      {size === "sm" ? sc.short : sc.label}
      {locked && <LockIcon size={size === "sm" ? 9 : 11} />}
    </span>
  );
}
