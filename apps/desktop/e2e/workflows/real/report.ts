import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DESKTOP_DIR } from "../env";
import type { LabResult } from "./lab";

/*
 * L'ÉCRITURE DES RAPPORTS D'ÉVAL — `evals-reports/`, à la racine du dépôt.
 *
 * Deux bancs, deux dossiers, JAMAIS mélangés : leurs chiffres ne veulent pas dire
 * la même chose. Le banc FIXTURES est déterministe (résultats d'outils figés) —
 * il mesure le MODÈLE et la GUIDANCE, et il est répétable à volonté. Le banc E2E
 * touche de vrais serveurs — il mesure ce que l'utilisateur vivra, mais ses
 * chiffres bougent avec la latence des services et le contenu réel des comptes.
 * Comparer un run fixtures à un run e2e ne prouverait rien ; comparer deux runs
 * fixtures avant/après un changement de guidance, si.
 *
 * ⚠️ Un rapport ne contient JAMAIS le texte des réponses en clair : les bancs
 * touchent de vrais comptes (fixtures comprises — leurs résultats portent de la
 * PII de test). On écrit des MESURES (durées, compte d'appels, répétitions,
 * verdicts) et, au plus, un extrait court explicitement neutralisé.
 */

export type EvalMode = "fixtures" | "e2e";

export interface EvalRun {
  mode: EvalMode;
  model: string;
  group: string;
  family: string;
  connectors: string[];
  results: LabResult[];
  /** Confirmations d'écriture demandées par la boucle (outil + verdict). */
  confirms: { tool: string; approved: boolean }[];
  /** Horodatage fourni par l'appelant (le spec) — pas d'horloge cachée ici. */
  at: string;
}

const REPORT_DIR = resolve(DESKTOP_DIR, "../../evals-reports");

const dirFor = (mode: EvalMode) => resolve(REPORT_DIR, mode);

/** Métriques agrégées d'un run — c'est ce qu'on suit d'un run à l'autre. */
export function metricsOf(results: LabResult[]) {
  const n = results.length || 1;
  const calls = results.reduce((s, r) => s + r.tools.length, 0);
  return {
    prompts: results.length,
    ok: results.filter((r) => !r.error && !r.timedOut && !r.loopStopped).length,
    errors: results.filter((r) => r.error).length,
    stuck: results.filter((r) => r.timedOut).length,
    looped: results.filter((r) => r.loopStopped).length,
    /** Boucles où un NOM D'OUTIL a été redacted : la boucle est (au moins en partie)
     *  induite par le NER, pas par le modèle — à soustraire du reproche au modèle. */
    redactLoops: results.filter((r) => r.loopStopped && r.toolRedactions.length).length,
    /** Tours SANS aucun appel d'outil : le modèle a nié une capacité qu'il avait. */
    silent: results.filter((r) => !r.tools.length && !r.error).length,
    calls,
    /** Pire répétition d'un même outil, tous tours confondus. */
    worstRepeat: Math.max(0, ...results.map((r) => r.maxRepeat)),
    /** Outils DISTINCTS touchés — la « largeur » sur un workflow complexe. */
    distinctTools: new Set(results.flatMap((r) => r.tools)).size,
    medianMs: [...results.map((r) => r.ms)].sort((a, b) => a - b)[Math.floor(n / 2)] ?? 0,
    maxMs: Math.max(0, ...results.map((r) => r.ms)),
  };
}

const stateOf = (r: LabResult) =>
  r.timedOut ? "⏳ bloqué" : r.error ? "✗ erreur" : r.loopStopped ? "🔁 boucle" : r.tools.length ? "✓" : "⚠️ sans outil";

/** Écrit (ou complète) le rapport d'un run et renvoie son chemin. */
export function writeEvalReport(run: EvalRun): string {
  const dir = dirFor(run.mode);
  mkdirSync(dir, { recursive: true });
  const slug = run.model.replace(/[^\w.-]+/g, "-");
  const path = resolve(dir, `${slug}.md`);
  const m = metricsOf(run.results);

  if (!existsSync(path)) {
    writeFileSync(
      path,
      `# ${run.model} — banc ${run.mode}\n\n` +
        `Un bloc par exécution de groupe, le plus récent EN BAS. ` +
        `Ce qu'on regarde bouger : \`sans outil\` et \`boucle\` (fiabilité), ` +
        `\`médiane\` (vitesse), \`outils distincts\` (largeur sur un workflow complexe).\n`,
    );
  }

  const rows = run.results
    .map(
      (r) =>
        `| ${r.id} | ${stateOf(r)} | ${Math.round(r.ms / 1000)} s | ${r.tools.length} | ${r.maxRepeat}× | ` +
        `${[...new Set(r.tools)].join(", ") || "—"} |`,
    )
    .join("\n");

  const writes = run.confirms.length
    ? run.confirms.map((c) => `${c.tool}${c.approved ? "" : " (refusé)"}`).join(", ")
    : "aucune";

  appendFileSync(
    path,
    `\n## ${run.at} · groupe \`${run.group}\` (${run.family}) · connecteurs : ${run.connectors.join(", ") || "aucun"}\n\n` +
      `${m.ok}/${m.prompts} nets · ${m.errors} erreur(s) · ${m.stuck} bloqué(s) · ${m.looped} boucle(s)` +
      `${m.redactLoops ? ` (dont ${m.redactLoops} par REDACTION d'un nom d'outil)` : ""} · ` +
      `${m.silent} sans outil · ${m.calls} appels (${m.distinctTools} outils distincts) · ` +
      `pire répétition ${m.worstRepeat}× · médiane ${Math.round(m.medianMs / 1000)} s · max ${Math.round(m.maxMs / 1000)} s\n\n` +
      `| workflow | état | durée | appels | répét. max | outils |\n|---|---|---|---|---|---|\n${rows}\n\n` +
      `Écritures confirmées : ${writes}\n`,
  );
  return path;
}

/** Une ligne par run dans un index commun — la vue « tous modèles » d'un coup d'œil. */
export function appendEvalIndex(run: EvalRun): void {
  const dir = dirFor(run.mode);
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, "index.md");
  if (!existsSync(path))
    writeFileSync(
      path,
      `# Banc ${run.mode} — index\n\n` +
        `| date | modèle | groupe | nets | erreurs | boucles | sans outil | répét. max | médiane |\n` +
        `|---|---|---|---|---|---|---|---|---|\n`,
    );
  const m = metricsOf(run.results);
  appendFileSync(
    path,
    `| ${run.at} | ${run.model} | ${run.group} | ${m.ok}/${m.prompts} | ${m.errors} | ${m.looped} | ` +
      `${m.silent} | ${m.worstRepeat}× | ${Math.round(m.medianMs / 1000)} s |\n`,
  );
}
