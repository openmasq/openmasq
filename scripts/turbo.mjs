#!/usr/bin/env node
// Lance turbo avec un cache posé HORS de l'arbre.
//
// Par défaut turbo écrit dans `<dépôt>/.turbo/cache`, donc dans l'arbre : un re-clone (ou,
// du temps de la convention worktree, chaque arbre neuf) repartait d'un cache froid et
// rebuildait la totalité du graphe.
// Les clés de cache de turbo sont un hachage du CONTENU (paquet + tâche + fichiers +
// hachages des dépendances), jamais du chemin absolu : un artefact produit dans un
// worktree est donc valide dans tous les autres, et deux branches divergentes ont
// naturellement des clés différentes.
//
// `turbo.json` ne peut PAS porter ce réglage — il refuse un `cacheDir` absolu et renvoie
// explicitement vers `--cache-dir` / `TURBO_CACHE_DIR` ; un chemin RELATIF, lui,
// se résoudrait ailleurs selon l'endroit où le worktree a été créé. D'où ce wrapper :
// un seul foyer pour le défaut, hérité par pnpm, la CI et chaque nouveau worktree sans
// aucune installation. Un `TURBO_CACHE_DIR` déjà présent dans l'environnement gagne.
//
// ⚠️ Le répertoire n'est jamais purgé automatiquement (turbo n'a pas de GC) : il grossit
// avec l'historique des hachages. Le vider est sans risque — au pire on rebuild.
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const cacheDir =
  process.env.TURBO_CACHE_DIR || join(homedir(), ".cache", "turbo", "openmasq");

const child = spawn("turbo", process.argv.slice(2), {
  stdio: "inherit",
  env: { ...process.env, TURBO_CACHE_DIR: cacheDir },
  shell: process.platform === "win32",
});

// `pnpm dev` est une tâche PERSISTANTE : sans ces deux lignes, le Ctrl-C tue ce wrapper
// avant que turbo ait rendu la main, et laisse les serveurs de dev orphelins. On relaie le
// signal et on ne sort que quand l'enfant est vraiment parti.
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
