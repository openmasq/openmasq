import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** La racine de l'app Electron — c'est ce chemin qu'on passe à `electron.launch`. */
export const DESKTOP_DIR = resolve(HERE, "../../..");

/**
 * Tout ce que la session produit vit ici, et RIEN d'autre : captures, journaux, profil
 * jetable, socket. Un seul dossier, ignoré par git, qu'on peut effacer sans réfléchir —
 * et que le skill sait citer à l'agent sans deviner.
 */
export const RUN_DIR = resolve(DESKTOP_DIR, "e2e/.parcours");
export const SOCK = resolve(RUN_DIR, "daemon.sock");
export const SHOTS = resolve(RUN_DIR, "captures");
export const PROFILE = resolve(RUN_DIR, "profil");
/** Le journal de bord : une ligne JSON par commande, c'est la trace que l'agent relit. */
export const JOURNAL = resolve(RUN_DIR, "journal.jsonl");
/** Le log du pilote lui-même (stdout/stderr du démon) — pour comprendre un démon mort. */
export const DAEMON_LOG = resolve(RUN_DIR, "daemon.log");
/**
 * La sortie du process principal quand l'app est lancée PAR QUELQU'UN D'AUTRE (mode attaché).
 * Le pilote ne tient alors aucun tuyau : c'est ce fichier qui porte `[mcp:raw]` et les
 * exceptions, donc la moitié des preuves. `devApp.ts` / `suivreLog.ts` disent le reste.
 */
export const MAIN_LOG = resolve(RUN_DIR, "main.log");
/** Les arguments RÉELS (un-redacted) reçus par un outil MCP FIXTURE — règle 11, sens sortant.
 *  Sur de VRAIS connecteurs l'équivalent est `OPENMASQ_MCP_RAW_LOG`, qui écrit sur la sortie
 *  du process principal (donc dans `errors`), parce qu'il vit dans le chemin de dispatch réel. */
export const TOOLCALL_LOG = resolve(RUN_DIR, "toolcalls.jsonl");
/**
 * Ce que CHAQUE appel provider a emporté : fournisseur, modèle, messages, noms d'outils.
 * C'est la seule preuve de la promesse quand le destinataire est un vrai modèle — le faux
 * endpoint, lui, gardait les corps en mémoire. ⚠️ Contient de la VRAIE PII en mode réel.
 */
export const WIRE_LOG = resolve(RUN_DIR, "wire.jsonl");
/**
 * Le catalogue de connecteurs FIXTURES — comptes simulés, aucun compte réel touché.
 * C'est CELUI des workflows e2e, pas une seconde copie : ses outils, ses schémas d'arguments
 * et ses formats de résultat sont déjà transcrits des vrais connecteurs, et une deuxième
 * liste dériverait de la première sans que rien ne le dise (règle 9).
 */
export const MCP_FIXTURES = resolve(DESKTOP_DIR, "e2e/fixtures/mcp/workflows.json");

export function ensureRunDir(): void {
  for (const d of [RUN_DIR, SHOTS]) mkdirSync(d, { recursive: true });
}
