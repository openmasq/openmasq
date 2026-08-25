import { dialog } from "electron";
// Par le barrel, pas par `./server/lifecycle` : c'est la surface publique de la famille, et
// la court-circuiter laisse une ré-exportation que plus personne n'atteint (knip la compte
// comme du code mort — à juste titre).
import { notePickedDir } from "./server";
import { withAgentBrowserHidden } from "./browser";

/**
 * Le sélecteur natif de dossier pour un octroi de chemin MCP — l'utilisateur ACCORDE le
 * dossier, c'est une capacité, pas un réglage.
 *
 * `hint` ne fait que pré-positionner le dialogue sur un dossier qu'on vient de DÉPOSER. Il
 * vient du renderer, donc il n'est pas de confiance — et il est inoffensif, parce qu'il
 * n'accorde rien : l'octroi est `notePickedDir` sur ce que le dialogue RETOURNE. Un hint
 * forgé ouvre le sélecteur au mauvais endroit, et c'est toute sa puissance. Non-chaîne ⇒ ignoré.
 *
 * ⚠️ Crochet E2E, jumeau de `OPENMASQ_E2E_ATTACH` : un sélecteur natif ne s'automatise pas,
 * donc un pilote de parcours désigne ici le dossier que l'utilisateur « aurait choisi ».
 * Double garde d'ENV DE LANCEMENT — un renderer ne peut pas écrire l'env du process
 * principal, donc une XSS ne peut pas s'auto-accorder un dossier. Et le chemin passe par
 * `notePickedDir` comme un vrai choix : l'octroi n'est pas court-circuité, il est produit
 * sans dialogue. Inerte sans les deux variables (donc en production).
 */
export async function pickGrantDir(hint: unknown): Promise<string | undefined> {
  if (process.env.OPENMASQ_E2E && process.env.OPENMASQ_E2E_PICK_DIR) {
    const dir = process.env.OPENMASQ_E2E_PICK_DIR;
    notePickedDir(dir);
    return dir;
  }
  const defaultPath = typeof hint === "string" && hint ? hint : undefined;
  const r = await withAgentBrowserHidden(() =>
    dialog.showOpenDialog({
      properties: ["openDirectory"],
      ...(defaultPath ? { defaultPath } : {}),
    }),
  );
  if (r.canceled || !r.filePaths[0]) return undefined;
  // Record the pick so mcpAddStdio will accept it as a path grant (audit M-4).
  notePickedDir(r.filePaths[0]);
  return r.filePaths[0];
}
