import { checkZipBomb } from "@openmasq/redact";
import { parseXml, attr, REL } from "./xml";

// An OOXML package (docx/pptx/xlsx are all the same shape): a zip of XML parts plus
// a `_rels` side-file per part mapping relationship ids → other parts. Shared by the
// docx and pptx parsers so path/rels resolution — the fiddly, get-it-wrong-quietly
// half — lives in ONE place. fflate is lazy-imported to stay off the main bundle.

/** Resolve a relationship `Target` against the directory of the part that declares it.
 *  Targets are RELATIVE to that part's folder and freely use `../`, so pptx's
 *  `ppt/slides/_rels/slide1.xml.rels` → `../media/image1.png` must land on
 *  `ppt/media/image1.png`. An absolute `/word/media/x` is package-root-relative. */
export function resolvePart(baseDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const segs = `${baseDir}/${target}`.split("/");
  const out: string[] = [];
  for (const s of segs) {
    if (!s || s === ".") continue;
    if (s === "..") out.pop();
    else out.push(s);
  }
  return out.join("/");
}

/** The `_rels` side-file path for a part: `ppt/slides/slide1.xml` →
 *  `ppt/slides/_rels/slide1.xml.rels`. */
export function relsPathFor(partPath: string): string {
  const i = partPath.lastIndexOf("/");
  const dir = i < 0 ? "" : partPath.slice(0, i);
  const file = i < 0 ? partPath : partPath.slice(i + 1);
  return `${dir ? `${dir}/` : ""}_rels/${file}.rels`;
}

export interface OoxmlPackage {
  /** Raw bytes of a part, or undefined when absent. */
  bytes(part: string): Uint8Array | undefined;
  /** UTF-8 text of a part, or undefined when absent. */
  text(part: string): string | undefined;
  /** Parsed XML of a part, or undefined when absent. Throws on malformed XML. */
  xml(part: string): Document | undefined;
  /** `rId` → resolved package path, for the part's own `_rels`. EXTERNAL targets are
   *  omitted (see below). Cached per part. */
  rels(part: string): Map<string, string>;
  /** Every part path matching `re`, sorted by their trailing number when they have
   *  one (`slide2` before `slide10` — a plain sort gets that backwards). */
  parts(re: RegExp): string[];
}

export async function openOoxml(bytes: Uint8Array): Promise<OoxmlPackage> {
  // ⚠️ `unzipSync` INFLATES every member up front, so the archive decides the allocation.
  // The upload path refuses a bomb before any parser sees it (`@openmasq/redact`
  // `guardUpload`), but this viewer is a SECOND door onto the same inflater: it opens
  // bytes read back out of the store, and a file can reach the store by routes the
  // upload gate never covered (a re-attach, an older row, an MCP tool result). A viewer
  // that defends itself is not redundant with a gate it does not sit behind — so run the
  // ZIP half of the very same check here, from the same implementation. The throw is the
  // documented contract of this module (`parseDocx`/`parsePptx` surface « illisible »).
  const bomb = checkZipBomb(bytes);
  if (bomb) throw new Error(bomb);
  const { unzipSync, strFromU8 } = await import("fflate");
  const zip = unzipSync(bytes);
  const relsCache = new Map<string, Map<string, string>>();

  const pkg: OoxmlPackage = {
    bytes: (part) => zip[part],
    text: (part) => (zip[part] ? strFromU8(zip[part]) : undefined),
    xml(part) {
      const t = this.text(part);
      return t === undefined ? undefined : parseXml(t);
    },
    rels(part) {
      const cached = relsCache.get(part);
      if (cached) return cached;
      const map = new Map<string, string>();
      const relsXml = this.text(relsPathFor(part));
      if (relsXml) {
        const i = part.lastIndexOf("/");
        const baseDir = i < 0 ? "" : part.slice(0, i);
        for (const rel of parseXml(relsXml).getElementsByTagNameNS(REL, "Relationship")) {
          const id = attr(rel, "Id");
          const target = attr(rel, "Target");
          if (!id || !target) continue;
          // SKIP TargetMode="External": the target is a URL, not a part. Resolving one
          // as a path would silently miss; worse, treating it as an image source would
          // turn a crafted document into an outbound request (a tracking pixel that
          // phones home the moment the user opens a preview). Local parts only — an
          // allow-list, not a filter (rule 7). The CSP blocks the fetch too; this is
          // the layer that never lets the URL reach the DOM in the first place.
          if (attr(rel, "TargetMode") === "External") continue;
          map.set(id, resolvePart(baseDir, target));
        }
      }
      relsCache.set(part, map);
      return map;
    },
    parts: (re) =>
      Object.keys(zip)
        .filter((k) => re.test(k))
        .sort((a, b) => {
          const na = Number(a.match(/(\d+)\.[a-z]+$/i)?.[1]);
          const nb = Number(b.match(/(\d+)\.[a-z]+$/i)?.[1]);
          if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
          return a.localeCompare(b);
        }),
  };
  return pkg;
}
