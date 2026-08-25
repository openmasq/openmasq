import { createContext, useContext } from "react";

/**
 * An "artifact" — a model-generated CSV or code block shown as a clickable FILE chip
 * in the message, opened in the right-split panel (`ArtifactPanel`) for a full view.
 */
export interface Artifact {
  id: string;
  kind: "csv" | "code";
  /** Language tag (`csv`, `python`, `sql`…) for the label. */
  lang: string;
  /** Human title shown on the chip + the panel header. */
  title: string;
  /** The raw block text (CSV rows / source code). */
  text: string;
}

export interface ArtifactApi {
  active: Artifact | null;
  open(a: Artifact): void;
  close(): void;
}

/** No-op default so a `CodeBlock` rendered outside a provider (tests, preview
 *  fragments) never throws — it just won't open a panel. */
const ArtifactContext = createContext<ArtifactApi>({ active: null, open: () => {}, close: () => {} });

export const ArtifactProvider = ArtifactContext.Provider;

/** The artifact controls — `open(a)` shows the split panel; `close()` hides it. */
export function useArtifact(): ArtifactApi {
  return useContext(ArtifactContext);
}
