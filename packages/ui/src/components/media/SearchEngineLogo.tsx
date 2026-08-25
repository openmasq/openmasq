import { searchEngineById } from "../../state/searchEngines";

/**
 * The brand mark for a search engine (DuckDuckGo / Brave / Google / …), rendered
 * from the `simple-icons` single-path glyph in the engine registry. Asset-free +
 * CSP-safe (inline SVG, no remote URL). `mono` paints it in `currentColor` (for a
 * compact tile that needs to match surrounding UI); otherwise it uses the official
 * brand colour.
 */
export function SearchEngineLogo({
  id,
  size = 16,
  mono = false,
}: {
  id: string | undefined;
  size?: number;
  mono?: boolean;
}) {
  const engine = searchEngineById(id);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={engine.name}
      fill={mono ? "currentColor" : engine.hex}
    >
      <path d={engine.path} />
    </svg>
  );
}
