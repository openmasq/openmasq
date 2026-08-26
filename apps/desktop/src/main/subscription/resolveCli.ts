/**
 * Où trouver le binaire d'une CLI d'abonnement — et pourquoi `PATH` ne suffit JAMAIS.
 *
 * L'app lancée depuis le Finder (le cas de tous les utilisateurs, par opposition à
 * `pnpm dev`) n'hérite pas du `PATH` du shell : macOS lui donne `/usr/bin:/bin:
 * /usr/sbin:/sbin` et rien de plus. Or `claude` s'installe dans `~/.local/bin`,
 * `codex` et `gemini` via npm global ou Homebrew — aucun de ces dossiers n'est dans
 * ce PATH minimal. C'est LE bug de cette famille : la détection marche en dev (lancé
 * d'un terminal, PATH complet) et échoue chez l'utilisateur, sans message utile.
 *
 * On sonde donc des racines connues EN PLUS du PATH. On ne lance PAS de shell de
 * login pour récupérer le vrai PATH : spawner `zsh -lc` exécute les rc de
 * l'utilisateur, donc du code tiers arbitraire, depuis le process privilégié — la
 * règle 7 l'interdit, et le gain (quelques installs exotiques) ne vaut pas la surface.
 *
 * ⚠️ Ce module ne dit PAS si la CLI est authentifiée, seulement si elle existe et est
 * exécutable. L'auth se constate à l'usage (voir `engine.ts`) : une CLI installée mais
 * jamais connectée échoue au premier envoi, et c'est ce message-là qu'il faut montrer.
 */
import { accessSync, constants } from "node:fs";
import { posix, win32 } from "node:path";

export type SubscriptionCliId = "claude" | "codex" | "gemini";

/** Le nom du binaire par CLI. Windows résout via `WINDOWS_EXTS`. */
const BIN_NAME: Record<SubscriptionCliId, string> = {
  claude: "claude",
  codex: "codex",
  gemini: "gemini",
};

/** Sur Windows un binaire npm est un `.cmd`; `spawn` ne complète pas tout seul. */
const WINDOWS_EXTS = ["", ".cmd", ".exe", ".bat", ".ps1"] as const;

/**
 * Racines d'installation connues, hors PATH. Ordre = priorité de sondage.
 * `~` est résolu par l'appelant (on prend `home` en entrée pour rester pur/testable).
 */
/**
 * Les primitives de chemin de la plateforme CIBLE, pas celles de l'hôte. Sans ça la
 * fonction ment sur sa signature : elle prend `platform` en paramètre mais calculerait
 * avec la sémantique de la machine qui exécute — un `C:\\…` jugé « relatif » sous macOS
 * (donc écarté), et un `PATH` Windows découpé sur `:` au lieu de `;`, ce qui coupe
 * chaque entrée en deux à la lettre de lecteur.
 */
function pathApi(platform: NodeJS.Platform) {
  return platform === "win32" ? win32 : posix;
}

function knownRoots(platform: NodeJS.Platform, home: string): string[] {
  const { join } = pathApi(platform);
  if (platform === "win32") {
    return [
      join(home, "AppData", "Roaming", "npm"),
      join(home, "AppData", "Local", "Programs"),
      join(home, ".local", "bin"),
    ];
  }
  return [
    join(home, ".local", "bin"), // claude (installeur officiel)
    join(home, ".claude", "local"), // claude (install "local" historique)
    "/opt/homebrew/bin", // Homebrew Apple Silicon — absent du PATH Finder
    "/usr/local/bin", // Homebrew Intel + npm global
    join(home, ".npm-global", "bin"),
    join(home, ".volta", "bin"),
    join(home, ".bun", "bin"),
    "/usr/bin",
  ];
}

export interface CandidateOptions {
  platform: NodeJS.Platform;
  home: string;
  /** Le `PATH` du process. Vide/absent est le cas NORMAL sous Finder, pas une erreur. */
  path?: string;
}

/**
 * Les chemins absolus à sonder, dans l'ordre — PATH d'abord (si l'utilisateur a
 * surchargé son install, on la respecte), puis les racines connues. Pur : c'est ce que
 * `resolveCli.test.ts` épingle, sans toucher au vrai système de fichiers.
 */
export function candidatePaths(cli: SubscriptionCliId, opts: CandidateOptions): string[] {
  const { join, isAbsolute, delimiter } = pathApi(opts.platform);
  const bin = BIN_NAME[cli];
  const exts = opts.platform === "win32" ? WINDOWS_EXTS : ([""] as const);
  const dirs = [
    ...(opts.path ? opts.path.split(delimiter).filter(Boolean) : []),
    ...knownRoots(opts.platform, opts.home),
  ];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const dir of dirs) {
    if (!isAbsolute(dir)) continue; // un PATH relatif est un vecteur, pas une install
    for (const ext of exts) {
      const full = join(dir, `${bin}${ext}`);
      if (seen.has(full)) continue;
      seen.add(full);
      out.push(full);
    }
  }
  return out;
}

/** Vrai si le chemin existe ET est exécutable. Isolé pour être stubbé en test. */
export type ExecutableProbe = (path: string) => boolean;

export const defaultProbe: ExecutableProbe = (path) => {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * Le premier candidat exécutable, ou `null`. `null` = "CLI absente", un état NORMAL
 * qui doit produire une invite d'installation dans l'UI — jamais une erreur technique.
 */
export function resolveCli(
  cli: SubscriptionCliId,
  opts: CandidateOptions,
  probe: ExecutableProbe = defaultProbe,
): string | null {
  for (const candidate of candidatePaths(cli, opts)) {
    if (probe(candidate)) return candidate;
  }
  return null;
}
