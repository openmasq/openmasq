import { ROUTINE_SUGGESTIONS } from "./routineTemplates";

/**
 * The SHIPPED prompt of a workflow template, with its `{accolades}` filled in — what
 * the user actually sends after picking that template and answering its blanks.
 *
 * It lives HERE, not in a test folder, because two suites need it — the free evals and
 * the paid desktop e2e — and a second copy is how a spec ends up testing a paraphrase
 * of a template instead of the template. Reword a template into something that no
 * longer drives its connector and both suites fail; copies would have kept passing
 * while the shipped text drifted.
 */
export function fillTemplate(id: string, values: Record<string, string>): string {
  const tpl = ROUTINE_SUGGESTIONS.find((s) => s.id === id);
  if (!tpl) throw new Error(`modèle de routine inconnu : « ${id} »`);
  const missing: string[] = [];
  const filled = tpl.prompt.replace(/\{([^}]+)\}/g, (_, raw: string) => {
    const key = String(raw).split(",")[0].trim(); // « {période, ex. hier 18 h} » → « période »
    const v = values[key];
    if (v === undefined) missing.push(key);
    return v ?? `{${raw}}`;
  });
  // A template that GAINS a placeholder must fail loudly here rather than send the
  // model a literal « {dépôt} » and quietly produce a plausible-looking wrong run.
  if (missing.length)
    throw new Error(`valeurs manquantes pour « ${id} » : ${missing.join(", ")}`);
  return filled;
}

/** The connectors a template declares — the set its scenario must actually drive. */
export function templateServers(id: string): string[] {
  const tpl = ROUTINE_SUGGESTIONS.find((s) => s.id === id);
  if (!tpl) throw new Error(`modèle de routine inconnu : « ${id} »`);
  return tpl.servers;
}
