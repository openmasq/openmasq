/**
 * WHICH TRIPLES THIS PLATFORM SHIPS — read from `electron-builder.cjs`, which is the only
 * place where that's decided.
 *
 * Why this isn't copied elsewhere (rule 9): this fact has THREE readers — the bake
 * (`bake-runtimes.ts`: one Python runtime per arch), CI (`release.yml`: one R2 archive
 * per arch) and the packaging itself. A list copied into a `package.json` or a
 * workflow diverges at the first arch addition, and the divergence doesn't show up at
 * build time: it shows up in use, on the machine that didn't get its interpreter.
 *
 * The config is CJS (it derives the product identifiers from
 * `packages/branding/branding.json`): so we `require()` it instead of parsing YAML by
 * hand. The fail-closed counterpart is kept — the function FAILS when it no longer
 * recognizes the config's shape, instead of returning an empty list that would
 * silently skip a bake.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const EB_CONFIG = join(HERE, "..", "electron-builder.cjs");

const require = createRequire(import.meta.url);

/** The part of the config we read here: the targets per platform block. */
export interface EbPlatformTargets {
  target?: Array<{ target?: string; arch?: string[] }>;
}
export type EbConfigShape = Record<string, unknown> & {
  mac?: EbPlatformTargets;
  win?: EbPlatformTargets;
  linux?: EbPlatformTargets;
};

/** The triple prefix each platform block of `electron-builder.cjs` carries. */
const OS_OF_BLOCK: Record<string, string> = { mac: "darwin", win: "win32", linux: "linux" };

/**
 * The triples shipped by a platform block (`mac` / `win`), deduplicated and ordered
 * as the config gives them — `dmg` and `zip` repeat the same arch list, that's normal.
 */
export function shippedTriples(block: keyof typeof OS_OF_BLOCK | string, config?: EbConfigShape): string[] {
  const os = OS_OF_BLOCK[block];
  if (!os) throw new Error(`shippedTriples: bloc de plateforme inconnu : ${block}`);
  const source = config ?? (require(EB_CONFIG) as EbConfigShape);
  const platform = source[block] as EbPlatformTargets | undefined;
  if (!platform) throw new Error(`shippedTriples: aucun bloc \`${block}\` dans electron-builder.cjs`);
  const targets = Array.isArray(platform.target) ? platform.target : [];
  const arches = targets.flatMap((t) => (Array.isArray(t.arch) ? t.arch : []));
  if (arches.length === 0) {
    // FAIL CLOSED: "no arch" is never a useful truth here. It means the
    // config's shape has changed — and a bake that bakes nothing would pass for a success.
    throw new Error(
      `shippedTriples: aucune \`arch: [...]\` sous \`${block}\` — la forme d'electron-builder.cjs a changé`,
    );
  }
  return [...new Set(arches)].map((arch) => `${os}-${arch}`);
}

/** The platform block corresponding to the current machine. */
export function currentBlock(platform: NodeJS.Platform = process.platform): string {
  const block = { darwin: "mac", win32: "win", linux: "linux" }[platform as string];
  if (!block) throw new Error(`shippedTriples: plateforme non empaquetée : ${platform}`);
  return block;
}
