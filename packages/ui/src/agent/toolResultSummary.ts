/**
 * A short, connector-agnostic blurb of a tool RESULT for the persisted workflow
 * trace (the "3 dépôts" / "README.md" line). `content` is the already-REDACTED
 * model-facing text, so the blurb never leaks real values. Prefers an item COUNT
 * for JSON list results, else a bounded first-line excerpt. Pure + unit-tested.
 */
export function summarizeToolResult(content: string): string | undefined {
  const text = (content ?? "").trim();
  if (!text) return undefined;
  const items = (n: number) => `${n} élément${n > 1 ? "s" : ""}`;
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return items(parsed.length);
    if (parsed && typeof parsed === "object") {
      const arr = Object.values(parsed as Record<string, unknown>).find(Array.isArray);
      if (arr) return items((arr as unknown[]).length);
    }
  } catch {
    // Not JSON — fall through to a text excerpt.
  }
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) ?? text;
  const blurb = firstLine.replace(/\s+/g, " ").trim();
  return blurb.length > 48 ? `${blurb.slice(0, 47)}…` : blurb;
}
