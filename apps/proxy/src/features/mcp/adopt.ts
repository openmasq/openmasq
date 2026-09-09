// Taking over the client's own integrations. Exclusivity without this would be a downgrade:
// `--strict-mcp-config` switches the client's servers off, so unless we pick them up the
// session simply loses Notion and the CRM. Adoption is what makes the swap invisible — the
// same tools, reached through the mask.
//
// It reads the client's configuration and never writes to it. An entry that cannot be used
// is REPORTED, one by one: a single malformed server must not cost the user every other.
import { readFileSync } from "node:fs";
import { pick, type AgentClient, type Declaration } from "./clients.js";
import { parseServerMap, type ServerSpec } from "./servers.js";

export interface AdoptEvents {
  /** A server we took over, and the scope it came from. */
  onAdopt?: (id: string, scope: string) => void;
  /** One we could not: an id already declared, an unusable entry. `why` names no credential. */
  onSkip?: (id: string, why: string) => void;
}

export interface AdoptOptions extends AdoptEvents {
  read?: (path: string) => string;
}

/** Parse one document's map, entry by entry, so one bad row does not sink the file. */
function fromDeclaration(
  declaration: Declaration,
  read: (p: string) => string,
  taken: Set<string>,
  events: AdoptEvents,
): ServerSpec[] {
  let doc: unknown;
  try {
    doc = JSON.parse(read(declaration.path));
  } catch {
    // A missing file is the normal case (no project config), not a problem to report.
    return [];
  }
  const map = pick(doc, declaration.at);
  if (typeof map !== "object" || map === null || Array.isArray(map)) return [];

  const specs: ServerSpec[] = [];
  for (const [id, raw] of Object.entries(map as Record<string, unknown>)) {
    if (taken.has(id)) {
      events.onSkip?.(id, "already declared — yours wins");
      continue;
    }
    try {
      const [spec] = parseServerMap({ [id]: raw });
      if (!spec) continue; // disabled in the client's own config
      taken.add(id);
      specs.push(spec);
      events.onAdopt?.(id, declaration.scope);
    } catch (err) {
      events.onSkip?.(id, err instanceof Error ? err.message : String(err));
    }
  }
  return specs;
}

/**
 * Every server the client declares, in its own precedence order (user, then local, then
 * project), skipping any id the user already gave us: an explicit `--mcp-config` entry is
 * the one that wins, because it is the one whose credentials we were handed on purpose.
 */
export function adoptFrom(
  client: AgentClient,
  cwd: string,
  home: string,
  declared: ServerSpec[],
  opts: AdoptOptions = {},
): ServerSpec[] {
  const read = opts.read ?? ((p: string) => readFileSync(p, "utf8"));
  const taken = new Set(declared.map((s) => s.id));
  const adopted: ServerSpec[] = [];
  for (const declaration of client.declarations(cwd, home))
    adopted.push(...fromDeclaration(declaration, read, taken, opts));
  return adopted;
}
