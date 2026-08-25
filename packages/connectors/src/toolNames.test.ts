import { describe, expect, it } from "vitest";
import { CONNECTORS } from "./index";

/**
 * **Le nom d'un outil est son contrat, pas une étiquette.**
 *
 * La boucle agentique (`@openmasq/ui`) classe lecture-vs-écriture sur le VERBE DE TÊTE du
 * nom nu, et cette classification décide de trois choses d'un coup : une carte de
 * confirmation s'affiche ou non, l'appel part en parallèle avec les autres lectures du tour
 * ou non, et le modèle est invité à grouper ses lectures ou non.
 *
 * Ces connecteurs-ci tournent DANS notre processus : le nom est le nôtre, donc l'erreur est
 * la nôtre. `run_report` (un rapport GA4, une lecture) passait pour une exécution — l'
 * utilisateur confirmait chaque rapport, et rien ne se parallélisait. D'où ce garde-fou,
 * qui vit ici plutôt que du côté du classifieur : `@openmasq/ui` ne dépend pas de ce
 * paquet, et un test qui recopierait la liste des noms rouillerait le jour d'un renommage.
 */

/** Verbes de tête que la boucle lit comme « ça exécute quelque chose ». Aucun outil de
 *  LECTURE ne doit en porter un ; un outil qui exécute vraiment est une exception à
 *  ajouter ici, en connaissance de cause. */
const EXECUTION_HEAD = /^(run|exec|execute|perform|apply|invoke|trigger)[_-]/i;

describe("les noms d'outils des connecteurs directs", () => {
  const tools = CONNECTORS.flatMap((c) => c.tools.map((t) => `${c.id}__${t.name}`));

  it("aucun ne commence par un verbe d'exécution", () => {
    expect(tools.filter((n) => EXECUTION_HEAD.test(n.split("__")[1]!))).toEqual([]);
  });

  it("le rapport GA4 s'appelle bien par un verbe de LECTURE", () => {
    expect(tools).toContain("google-analytics__get_report");
  });

  it("chaque nom est en snake_case minuscule — le classifieur découpe là-dessus", () => {
    for (const n of tools) expect(n.split("__")[1]!).toMatch(/^[a-z][a-z0-9_]*$/);
  });
});
