import { existsSync, openSync, readSync, closeSync, statSync } from "node:fs";

/**
 * Follows a growing file — the equivalent of `tail -f`, in Node.
 *
 * ⚠️ **This is the half of the proof the ATTACHED mode would otherwise lose.** When the driver
 * spawns the app, it reads its pipes; when it ATTACHES to an app launched by someone
 * else (`devApp.ts` says why that's sometimes the only path), that output goes out into
 * THAT person's terminal. And `[mcp:raw]` — the REAL, un-redacted arguments received
 * by each tool — comes out precisely there, on stdout. Without this following, `D errors` and
 * `D toolcalls` would answer "nothing" on a perfectly chatty app, and the agent
 * would conclude a tool was never called.
 *
 * Hence the attached-mode convention: the app launches redirecting its output into
 * `.parcours/main.log`, and that's the file we follow.
 */
const INTERVALLE_MS = 400;

export function suivreLog(chemin: string, noter: (ligne: string) => void): () => void {
  // From the START of the file, not from now: what the app said on startup
  // (native modules, mounted connectors, first errors) is what explains the rest.
  let lu = 0;
  let reste = "";
  let vivant = true;

  const avaler = () => {
    if (!vivant || !existsSync(chemin)) return;
    let taille: number;
    try {
      taille = statSync(chemin).size;
    } catch {
      return;
    }
    // TRUNCATED file (app relaunched into the same log): start over from zero rather than
    // reading at an offset that no longer exists — otherwise following goes silent for good.
    if (taille < lu) {
      lu = 0;
      reste = "";
    }
    if (taille === lu) return;
    const fd = openSync(chemin, "r");
    try {
      const tampon = Buffer.alloc(taille - lu);
      const n = readSync(fd, tampon, 0, tampon.length, lu);
      lu += n;
      const lignes = (reste + tampon.subarray(0, n).toString("utf8")).split("\n");
      reste = lignes.pop() ?? "";
      for (const l of lignes) if (l.trim()) noter(l);
    } finally {
      closeSync(fd);
    }
  };

  avaler();
  const t = setInterval(avaler, INTERVALLE_MS);
  t.unref?.();
  return () => {
    vivant = false;
    clearInterval(t);
  };
}
