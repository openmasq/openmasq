#!/usr/bin/env node
/**
 * Le gate LOC du PRE-COMMIT — sur les fichiers STAGÉS uniquement, et sur leur contenu
 * STAGÉ (`git show :path`), jamais sur l'arbre de travail entier.
 *
 * Pourquoi pas `check:loc` tel quel : plusieurs sessions travaillent en parallèle sur
 * cet arbre — un dépassement dans le WIP *d'une autre* session bloquerait le commit de
 * celle-ci, et le gate rouge en permanence n'apprend plus rien à personne. Ici, un
 * rouge = VOTRE commit ferait franchir le cap à un fichier — exactement l'info utile,
 * au moment où la corriger coûte le moins. (CI garde `check:loc` sur l'arbre complet.)
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { inLocScope } from "./locScope.mjs";

const CAP = 300;

// L'allowlist est un objet { "chemin": lignes } — la même que `check:loc` lit.
const allow = new Set(
  Object.keys(JSON.parse(readFileSync(new URL("./file-size-allowlist.json", import.meta.url), "utf8"))),
);

const staged = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACM"], {
  encoding: "utf8",
})
  .split("\n")
  .filter((f) => f && inLocScope(f) && !allow.has(f));

const over = [];
for (const f of staged) {
  let content;
  try {
    content = execFileSync("git", ["show", `:${f}`], { encoding: "utf8" });
  } catch {
    continue; // disparu de l'index entre-temps — rien à mesurer
  }
  const lines = content.split("\n").length - (content.endsWith("\n") ? 1 : 0);
  if (lines > CAP) over.push({ f, lines });
}

if (over.length) {
  console.error(`✗ ${over.length} fichier(s) STAGÉ(s) au-dessus du cap de ${CAP} lignes (règle 1) :`);
  for (const { f, lines } of over) console.error(`    ${String(lines).padStart(5)}  ${f}`);
  console.error("  Scindez avant de committer (dossier + barrel), ou ajoutez à l'allowlist");
  console.error("  via `node scripts/check-file-size.mjs --update` en disant pourquoi.");
  process.exit(1);
}
