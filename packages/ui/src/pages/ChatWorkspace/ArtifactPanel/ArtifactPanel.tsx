import { useState } from "react";
import { CopyIcon, XIcon, GridIcon } from "../../../components/brand";
import { parseCsvText } from "../../../components/markdown/logic/csvParse";
import { CsvTableView } from "../../../components/markdown/blocks/CsvTableView";
import { SyntaxHighlight } from "../../../components/markdown/blocks/SyntaxHighlight";
import type { Artifact } from "../../../containers/providers/artifact";

/** Small `</>` code glyph (no matching icon in brand.tsx). */
function CodeGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m8 18-6-6 6-6" />
      <path d="m16 6 6 6-6 6" />
    </svg>
  );
}

/**
 * Right-split pane showing a model-generated artifact in FULL: a CSV as a table, or
 * code in a scrollable block. Opened by clicking an `md-artifact-chip` in a message
 * (see `CodeBlock` + the `useArtifact` context). Mirrors the `BrowserPanel` layout;
 * mutually exclusive with the browser (AppShell closes one when the other opens).
 */
export function ArtifactPanel({ artifact, onClose }: { artifact: Artifact; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const table = artifact.kind === "csv" ? parseCsvText(artifact.text) : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(artifact.text);
    } catch {
      /* clipboard blocked — ignore */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="artifact-pane" aria-label="Aperçu du fichier">
      <div className="artifact-head">
        <span className="artifact-glyph">
          {artifact.kind === "csv" ? <GridIcon size={15} /> : <CodeGlyph />}
        </span>
        <div className="artifact-title-wrap">
          <div className="artifact-title" title={artifact.title}>
            {artifact.title}
          </div>
          <div className="artifact-sub">{artifact.lang.toUpperCase()}</div>
        </div>
        <button type="button" className="artifact-btn" onClick={copy} title="Copier">
          {copied ? "Copié" : <CopyIcon size={15} />}
        </button>
        <button type="button" className="artifact-btn" onClick={onClose} aria-label="Fermer" title="Fermer">
          <XIcon size={15} />
        </button>
      </div>
      <div className="artifact-body">
        {table ? (
          <CsvTableView table={table} />
        ) : (
          <pre className="artifact-code">
            <code className="hljs">
              <SyntaxHighlight code={artifact.text} lang={artifact.lang} />
            </code>
          </pre>
        )}
      </div>
    </div>
  );
}
