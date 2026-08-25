import { existsSync, openSync, readSync, closeSync, statSync } from "node:fs";

/**
 * Suivre un fichier qui grossit — l'équivalent de `tail -f`, en Node.
 *
 * ⚠️ **C'est la moitié de preuve que le mode ATTACHÉ perdrait sinon.** Quand le pilote
 * spawne l'app, il lit ses tuyaux ; quand il s'ATTACHE à une app lancée par quelqu'un
 * d'autre (`devApp.ts` dit pourquoi c'est parfois la seule voie), cette sortie part dans
 * LE terminal de cette personne. Or `[mcp:raw]` — les arguments RÉELS, un-redacted, reçus
 * par chaque outil — sort précisément là, sur stdout. Sans ce suivi, `D errors` et
 * `D toolcalls` répondraient « rien » sur une app parfaitement bavarde, et l'agent
 * conclurait à un outil jamais appelé.
 *
 * D'où la convention du mode attaché : l'app se lance en redirigeant sa sortie dans
 * `.parcours/main.log`, et c'est ce fichier qu'on suit.
 */
const INTERVALLE_MS = 400;

export function suivreLog(chemin: string, noter: (ligne: string) => void): () => void {
  // Depuis le DÉBUT du fichier, pas depuis maintenant : ce que l'app a dit en démarrant
  // (modules natifs, connecteurs montés, premières erreurs) est ce qui explique le reste.
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
    // Fichier TRONQUÉ (relance de l'app dans le même log) : repartir de zéro plutôt que
    // de lire à un offset qui n'existe plus — sinon le suivi se tait définitivement.
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
