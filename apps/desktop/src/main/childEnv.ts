/**
 * L'environnement qu'un ENFANT tiers reçoit — une ALLOWLIST, jamais l'héritage.
 *
 * `{ ...process.env }` tend à l'enfant tout ce que la session de l'utilisateur porte :
 * lancée depuis un terminal, l'app hérite des `AWS_*`, `GITHUB_TOKEN`, clés d'API du
 * shell — et les retransmettait au broker (la closure express/@mcp qui détient les
 * jetons OAuth) et au serveur @playwright/mcp. Ces enfants exécutent du code TIERS :
 * la règle 7 dit de ne jamais tendre à un enfant un secret dont il n'a pas besoin, et
 * un héritage est une denylist implicite — chaque variable nouvelle passe par défaut.
 *
 * L'allowlist est le MINIMUM vital d'un process Node/Electron par plateforme :
 * identité et chemins (HOME, PATH, TMPDIR…), locale, proxys d'entreprise (sans eux une
 * machine derrière un proxy perd tout egress), et le socle Windows (un enfant sans
 * `SystemRoot` meurt en DLL init). Tout le reste — dont chaque secret possible — tombe.
 *
 * Les enfants DÉJÀ minimaux (NER, embed, extraction, jail Python) construisent leur env
 * à la main et n'ont pas besoin d'elle. Les re-spawns de NOTRE binaire (navigateur
 * agent) restent en héritage : même code, même confiance — filtrer n'y protège rien.
 */

/** Ce qu'un enfant Node/Electron a le droit de voir. Rien d'autre ne passe. */
const ALLOWED = [
  // Identité + chemins (POSIX)
  "HOME", "USER", "LOGNAME", "PATH", "TMPDIR", "SHELL", "LANG", "LC_ALL", "TZ",
  // Proxys d'entreprise — les deux casses existent dans la nature.
  "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy",
  // Socle Windows — un process sans SystemRoot/COMSPEC ne démarre pas.
  "SystemRoot", "SystemDrive", "windir", "COMSPEC", "PATHEXT",
  "APPDATA", "LOCALAPPDATA", "USERPROFILE", "PROGRAMDATA", "TEMP", "TMP",
] as const;

/** Pur, pour être épinglé par `childEnv.test.ts` sans toucher au vrai environnement. */
export function filterChildEnv(
  source: NodeJS.ProcessEnv,
  extra: Record<string, string> = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ALLOWED) {
    const v = source[key];
    if (v !== undefined) out[key] = v;
  }
  return { ...out, ...extra };
}

/** L'env minimal d'un enfant TIERS : l'allowlist + ce que l'appelant nomme. */
export function minimalChildEnv(extra: Record<string, string> = {}): Record<string, string> {
  return filterChildEnv(process.env, extra);
}
