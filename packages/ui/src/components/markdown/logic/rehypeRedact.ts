import { compileVault, segmentsWith, type VaultMatcher } from "@openmasq/redact";

/**
 * Renders model output as Markdown — bold/italic, lists, tables, code, links,
 * and LaTeX math (via KaTeX) — while keeping the redaction highlighting.
 *
 * Highlighting is done as a rehype pass over the parsed tree: each text node is
 * split against the vault and matched values are wrapped in a <mark>. This way a
 * redacted value stays highlighted even inside bold text, a list item, OR a code
 * block (a `.env` / config dump is exactly where redacted values show up) — only
 * rendered KaTeX math is left untouched.
 *
 * The vault is compiled ONCE per pass (`compileVault`), not once per text node:
 * a pasted document is hundreds of nodes, and recompiling an N-value alternation
 * for each of them — across every bubble a conversation mounts — was the bulk of
 * the lag when opening a long, heavily-redacted thread.
 */

// Only skip rendered math — code/pre ARE highlighted (redacted values often live
// in a config/code block). `toSegments` only wraps known vault values, so the
// surrounding code text is untouched.
const SKIP_TAGS = new Set<string>();

function hasClass(node: any, name: string): boolean {
  const cls = node?.properties?.className;
  return Array.isArray(cls) ? cls.includes(name) : cls === name;
}

export function rehypeRedact(
  vault?: Record<string, string>,
  kinds?: Record<string, string>,
  revealed?: Set<string>,
) {
  // `null` when there is no vault / nothing in it — the pass is then a no-op.
  const matcher: VaultMatcher | null = vault ? compileVault(vault) : null;
  return () => (tree: any) => {
    if (!matcher) return;
    walk(tree, false);
  };

  function walk(node: any, frozen: boolean) {
    if (!Array.isArray(node.children)) return;
    const next: any[] = [];
    for (const child of node.children) {
      if (child.type === "text" && !frozen) {
        next.push(...splitText(child.value));
      } else {
        if (Array.isArray(child.children)) {
          // Don't touch text inside code or rendered KaTeX math.
          const stop =
            frozen ||
            SKIP_TAGS.has(child.tagName) ||
            hasClass(child, "katex") ||
            hasClass(child, "math");
          walk(child, stop);
        }
        next.push(child);
      }
    }
    node.children = next;
  }

  function splitText(value: string): any[] {
    const segments = segmentsWith(value, matcher!, kinds);
    if (segments.length === 1 && segments[0].kind === "text") {
      return [{ type: "text", value }];
    }
    return segments.map((s) =>
      s.kind === "text"
        ? { type: "text", value: s.value }
        : {
            type: "element",
            tagName: "mark",
            properties: {
              className: [
                "redaction-mark",
                `hl-${s.tone}`,
                ...(revealed?.has(s.value) ? ["suspended"] : []),
              ],
              // Consumed by the shared RedactionInlineReveal (delegated hover).
              "data-real": s.value,
              "data-fake": s.placeholder ?? "",
              "data-kind": s.label ?? "sensitive",
              "data-tone": s.tone ?? "slate",
            },
            children: [{ type: "text", value: s.value }],
          },
    );
  }
}
