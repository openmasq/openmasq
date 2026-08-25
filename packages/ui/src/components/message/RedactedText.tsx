import { useMemo } from "react";
import { toSegments, type RedactionSegment } from "@openmasq/redact";

/**
 * Renders the message with each sensitive span shown as its REAL value,
 * highlighted in a colour that depends on its type (name / email / phone /
 * company / number). The model only ever saw the scrubbed version.
 */
export function RedactedText({
  text,
  vault,
  kinds,
  revealed,
}: {
  text: string;
  vault?: Record<string, string>;
  kinds?: Record<string, string>;
  revealed?: Set<string>;
}) {
  // Segmenting scans the whole text once per vault value, so it must not re-run on
  // an unrelated render — notably `revealed`, which changes on every hover and is
  // read below at render time, NOT here. The vault/kinds refs are replaced (never
  // mutated) by the store, so identity is a sound dep.
  const segments: RedactionSegment[] = useMemo(
    () =>
      vault && Object.keys(vault).length > 0
        ? toSegments(text, vault, kinds)
        : [{ kind: "text", value: text }],
    [text, vault, kinds],
  );

  // Marks carry the real/fake/kind as data-* so the shared RedactionInlineReveal
  // (delegated hover, portal, auto-placed) can show the value + un-redact action.
  return (
    <>
      {segments.map((s, i) =>
        s.kind === "text" ? (
          <span key={i}>{s.value}</span>
        ) : (
          <mark
            key={i}
            className={`redaction-mark hl-${s.tone}${revealed?.has(s.value) ? " suspended" : ""}`}
            data-real={s.value}
            data-fake={s.placeholder ?? ""}
            data-kind={s.label ?? "sensitive"}
            data-tone={s.tone ?? "slate"}
          >
            {s.value}
          </mark>
        ),
      )}
    </>
  );
}
