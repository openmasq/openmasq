import { useState, type CSSProperties } from "react";
import { parseCsvText } from "../logic/csvParse";
import { GridIcon } from "../../brand";
import { useArtifact } from "../../../containers/providers/artifact";
import { SyntaxHighlight } from "./SyntaxHighlight";
import { canHighlight } from "../logic/codeHighlight";
import { DocumentCard } from "./DocumentCard";
import { SkillCard } from "./SkillCard";
import { documentTitle } from "../../export/documentExport";

/**
 * A fenced code block with a header: the language label + a per-language accent
 * colour + a copy button. react-markdown renders a fenced block as
 * `<pre><code class="language-xxx">…</code></pre>`; we wrap that `<pre>` so the
 * inner code (already carrying the redaction `<mark>`s from `rehypeRedact`) is
 * left intact, and only add the chrome around it.
 */

// Nice display names for common language tags; anything else falls back to the
// raw tag upper-cased (so an unknown lang still shows something sensible).
const LANG_LABEL: Record<string, string> = {
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  javascript: "JavaScript", typescript: "TypeScript",
  ts: "TypeScript", tsx: "TypeScript",
  py: "Python", python: "Python", rb: "Ruby", ruby: "Ruby", go: "Go", golang: "Go",
  rs: "Rust", rust: "Rust", java: "Java", kt: "Kotlin", kotlin: "Kotlin",
  c: "C", cpp: "C++", "c++": "C++", cc: "C++", cs: "C#", php: "PHP",
  swift: "Swift", scala: "Scala", dart: "Dart", lua: "Lua", r: "R", perl: "Perl",
  sh: "Shell", bash: "Shell", zsh: "Shell", shell: "Shell", ps1: "PowerShell",
  json: "JSON", jsonc: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML",
  ini: "INI", env: "dotenv", dotenv: "dotenv", properties: "Properties",
  md: "Markdown", markdown: "Markdown", mdx: "MDX",
  html: "HTML", xml: "XML", svg: "SVG", css: "CSS", scss: "SCSS", less: "Less",
  sql: "SQL", graphql: "GraphQL", gql: "GraphQL", proto: "Protobuf",
  dockerfile: "Dockerfile", docker: "Dockerfile", make: "Makefile",
  makefile: "Makefile", diff: "Diff", patch: "Diff", text: "Texte", txt: "Texte",
};

/** A stable hue (0–359) derived from the language tag → a consistent per-language colour. */
function langHue(lang: string): number {
  let h = 0;
  for (let i = 0; i < lang.length; i++) h = (h * 31 + lang.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** The `language-xxx` class → the bare tag (lower-case), or "" when none. */
function langOf(node: any): string {
  const code = node?.children?.find((c: any) => c.tagName === "code") ?? node?.children?.[0];
  const cls = code?.properties?.className;
  const list = Array.isArray(cls) ? cls : cls ? [cls] : [];
  const tag = list.find((c: any) => typeof c === "string" && c.startsWith("language-"));
  return tag ? String(tag).slice("language-".length).toLowerCase() : "";
}

/** True when the block contains a redaction `<mark>` (a redacted value shown in the
 *  code). Syntax highlighting re-tokenises the RAW text and would drop those marks, so
 *  a marked block keeps the plain, marked render — redaction wins over highlighting. */
function hasRedactionMark(node: any): boolean {
  if (!node) return false;
  if (node.tagName === "mark") return true;
  return Array.isArray(node.children) && node.children.some(hasRedactionMark);
}

/** Gather the plain text of a hast node (incl. the redaction `<mark>` children). */
function nodeText(node: any): string {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  if (Array.isArray(node.children)) return node.children.map(nodeText).join("");
  return "";
}

async function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    /* fall through */
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.className = "sr-only-copy";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } catch {
    /* nothing else to try */
  }
  document.body.removeChild(ta);
}

let ARTIFACT_SEQ = 0;

/** A clickable "file" chip for a CSV / substantial code block — opens it in the
 *  right-split `ArtifactPanel` (see `useArtifact`). Reads as a file, not code. */
function ArtifactChip({
  kind,
  lang,
  title,
  hint,
  text,
}: {
  kind: "csv" | "code";
  lang: string;
  title: string;
  hint: string;
  text: string;
}) {
  const { open } = useArtifact();
  return (
    <button
      type="button"
      className={`md-artifact-chip kind-${kind}`}
      onClick={() => open({ id: `artifact-${++ARTIFACT_SEQ}`, kind, lang, title, text })}
    >
      <span className="md-artifact-glyph">
        {kind === "csv" ? (
          <GridIcon size={17} />
        ) : (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m8 18-6-6 6-6" />
            <path d="m16 6 6 6-6 6" />
          </svg>
        )}
      </span>
      <span className="md-artifact-text">
        <span className="md-artifact-title">{title}</span>
        <span className="md-artifact-hint">{hint}</span>
      </span>
      <span className="md-artifact-open">Ouvrir</span>
    </button>
  );
}

export function CodeBlock({ node, children }: any) {
  const [copied, setCopied] = useState(false);
  const lang = langOf(node);
  const label = lang ? (LANG_LABEL[lang] ?? lang.toUpperCase()) : "Code";

  // A model-generated CSV or a SUBSTANTIAL code block renders as a clickable FILE
  // chip that opens the right-split ArtifactPanel (full table / full code) — short
  // snippets stay inline (below).
  const text = nodeText(node);
  // A ```document fence (the model's standalone deliverable — see systemPrompt.ts
  // DOCUMENT_GUIDANCE) renders INLINE as a bordered, downloadable card, not code.
  if (lang === "document") {
    return <DocumentCard title={documentTitle(text)} text={text} />;
  }
  // ```competence / ```workflow (systemPrompt.ts `SKILL_GUIDANCE`) — ce que le modèle
  // vient de FABRIQUER pour la liste de l'utilisateur, avec son bouton d'adoption.
  if (lang === "competence" || lang === "workflow") {
    return <SkillCard kind={lang} text={text} />;
  }
  const csvTable = lang === "csv" || lang === "tsv" ? parseCsvText(text) : null;
  const lines = text.replace(/\n+$/, "").split("\n").length;
  if (csvTable) {
    const cols = csvTable.headers.length;
    return (
      <ArtifactChip
        kind="csv"
        lang={lang}
        title="Tableau CSV"
        hint={`${csvTable.rows.length} ligne${csvTable.rows.length > 1 ? "s" : ""} · ${cols} colonne${cols > 1 ? "s" : ""}`}
        text={text}
      />
    );
  }
  if (lang && (lines >= 6 || text.length >= 300)) {
    return (
      <ArtifactChip
        kind="code"
        lang={lang}
        title={label}
        hint={`${lines} ligne${lines > 1 ? "s" : ""}`}
        text={text}
      />
    );
  }

  const onCopy = async () => {
    await copyText(nodeText(node));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  // Per-language accent: a runtime-computed hue drives the CSS accent (the ONE
  // allowed inline-style case — a dynamic per-item colour from data).
  const style = lang ? ({ "--lang-hue": langHue(lang) } as CSSProperties) : undefined;

  // Syntax-highlight the snippet when its language is recognised AND it carries no
  // redaction mark (a marked block keeps its plain, hover-revealable render — see
  // hasRedactionMark). Highlighting works on the display text (real values).
  const highlight = canHighlight(lang) && !hasRedactionMark(node);

  return (
    <div className={`md-code${lang ? " has-lang" : ""}`} style={style}>
      <div className="md-code-head">
        <span className="md-code-lang">{label}</span>
        <button type="button" className="md-code-copy" onClick={onCopy}>
          {copied ? "Copié" : "Copier"}
        </button>
      </div>
      {highlight ? (
        <pre>
          <code className={`hljs language-${lang}`}>
            <SyntaxHighlight code={text} lang={lang} />
          </code>
        </pre>
      ) : (
        <pre>{children}</pre>
      )}
    </div>
  );
}
