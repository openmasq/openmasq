import { getMessages } from "@openmasq/i18n";
import { describe, expect, it } from "vitest";
import { SIMPLE_MODEL_IDS } from "@openmasq/catalog";
import { MODELS, type ModelInfo } from "@openmasq/llm";
import { DEFAULT_MODEL_ID } from "../../prompt/models";
import { favoriteSet, simpleMenuModels, simpleMenuSections, toggleFavoriteModel } from "./simpleList";

const byId = (id: string): ModelInfo => {
  const m = MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`id absent du registre : ${id}`);
  return m;
};
const ALL = MODELS.slice();

const fr = getMessages("fr");

describe("la liste favorite elle-même", () => {
  // ⚠️ Une liste figée d'ids et un registre qui bouge : sans ce test, retirer un modèle
  // du registre viderait la vue simplifiée en silence, et personne ne le verrait avant
  // qu'un utilisateur n'ouvre un menu vide.
  it("chaque id existe dans le registre", () => {
    const inconnus = SIMPLE_MODEL_IDS.filter((id) => !MODELS.some((m) => m.id === id));
    expect(inconnus, `ids absents du registre : ${inconnus.join(", ")}`).toEqual([]);
  });

  // La raison d'être du choix d'OpenRouter : cette vue doit rester utilisable SANS
  // abonnement. Un id Scaleway s'afficherait grisé pour qui n'a pas
  // souscrit — une « simplification » qui ne propose rien d'appelable.
  it("n'est faite que d'ids OpenRouter (utilisables sur la clé personnelle)", () => {
    const horsSujet = SIMPLE_MODEL_IDS.filter((id) => byId(id).provider !== "openrouter");
    expect(horsSujet, `fournisseur non-OpenRouter : ${horsSujet.join(", ")}`).toEqual([]);
  });

  it("commence par des modèles gratuits — ce qu'on essaie sans rien engager", () => {
    expect(SIMPLE_MODEL_IDS[0]).toMatch(/:free$/);
    expect(SIMPLE_MODEL_IDS.filter((id) => id.endsWith(":free")).length).toBeGreaterThanOrEqual(2);
  });

  // La liste s'ouvre sur ce qui TOURNE. Si le défaut n'était pas son premier élément, le
  // menu proposerait en tête un modèle que la conversation n'utilise pas — et le modèle
  // réellement en cours n'apparaîtrait que relégué sous « Modèle en cours ».
  it("commence par le modèle PAR DÉFAUT des nouvelles conversations", () => {
    expect(SIMPLE_MODEL_IDS[0]).toBe(DEFAULT_MODEL_ID);
  });

  it("reste COURTE — au-delà d'une poignée, ce n'est plus une simplification", () => {
    expect(SIMPLE_MODEL_IDS.length).toBeLessThanOrEqual(8);
  });
});

describe("simpleMenuModels", () => {
  it("rend les favoris DANS L'ORDRE de la liste", () => {
    const out = simpleMenuModels(ALL, SIMPLE_MODEL_IDS[0]);
    expect(out.map((m) => m.id)).toEqual([...SIMPLE_MODEL_IDS]);
  });

  it("écarte un favori que ce poste ne peut pas proposer (interdit par l'org)", () => {
    const sansPremier = ALL.filter((m) => m.id !== SIMPLE_MODEL_IDS[0]);
    const out = simpleMenuModels(sansPremier, SIMPLE_MODEL_IDS[1]);
    expect(out.map((m) => m.id)).not.toContain(SIMPLE_MODEL_IDS[0]);
  });

  // ⚠️ LA règle qui évite l'absurde : basculer en vue simplifiée avec un modèle choisi
  // dans la vue complète le ferait DISPARAÎTRE de son propre sélecteur, la conversation
  // continuant de tourner dessus. Il est ajouté en QUEUE — il ne devient pas un favori.
  it("garde le modèle COURANT même hors favoris, et en dernier", () => {
    const horsListe = MODELS.find(
      (m) => m.provider === "openrouter" && !SIMPLE_MODEL_IDS.includes(m.id),
    )!;
    const out = simpleMenuModels(ALL, horsListe.id);
    expect(out.map((m) => m.id)).toEqual([...SIMPLE_MODEL_IDS, horsListe.id]);
  });

  it("n'ajoute rien pour un modèle courant vide ou inconnu", () => {
    expect(simpleMenuModels(ALL, "").map((m) => m.id)).toEqual([...SIMPLE_MODEL_IDS]);
    expect(simpleMenuModels(ALL, "nexiste/pas").map((m) => m.id)).toEqual([...SIMPLE_MODEL_IDS]);
  });

  it("ne duplique pas le courant quand il EST un favori", () => {
    const out = simpleMenuModels(ALL, SIMPLE_MODEL_IDS[2]);
    expect(out.filter((m) => m.id === SIMPLE_MODEL_IDS[2])).toHaveLength(1);
  });
});

describe("favoris personnalisés", () => {
  // Deux ids OpenRouter du registre, hors liste par défaut, pour jouer des favoris choisis.
  const custom = MODELS.filter(
    (m) => m.provider === "openrouter" && !SIMPLE_MODEL_IDS.includes(m.id),
  ).slice(0, 2);

  it("les favoris de l'utilisateur REMPLACENT la liste par défaut", () => {
    const fav = custom.map((m) => m.id);
    const out = simpleMenuModels(ALL, fav[0], fav);
    expect(out.map((m) => m.id)).toEqual(fav);
    // et aucun id du défaut catalogue ne s'y invite
    expect(out.some((m) => SIMPLE_MODEL_IDS.includes(m.id))).toBe(false);
  });

  it("favoris vides ⇒ on garde le défaut catalogue", () => {
    expect(simpleMenuModels(ALL, "", []).map((m) => m.id)).toEqual([...SIMPLE_MODEL_IDS]);
    expect(simpleMenuModels(ALL, "").map((m) => m.id)).toEqual([...SIMPLE_MODEL_IDS]);
  });

  // ⚠️ L'invariant « jamais un menu vide » : un favori épinglé puis devenu inatteignable
  // (retiré du registre, interdit par l'org) ne doit pas laisser un sélecteur vide.
  it("favoris tous inatteignables ⇒ repli sur le défaut catalogue", () => {
    const out = simpleMenuModels(ALL, "", ["nexiste/pas-1", "nexiste/pas-2"]);
    expect(out.map((m) => m.id)).toEqual([...SIMPLE_MODEL_IDS]);
  });

  it("le modèle courant reste ajouté en queue, même avec des favoris choisis", () => {
    const fav = [custom[0].id];
    const out = simpleMenuModels(ALL, custom[1].id, fav);
    expect(out.map((m) => m.id)).toEqual([custom[0].id, custom[1].id]);
  });

  it("favoriteSet reflète les favoris choisis, sinon le défaut", () => {
    expect(favoriteSet([custom[0].id]).has(custom[0].id)).toBe(true);
    expect(favoriteSet([custom[0].id]).has(SIMPLE_MODEL_IDS[0])).toBe(false);
    expect(favoriteSet(undefined).has(SIMPLE_MODEL_IDS[0])).toBe(true);
  });

  it("toggleFavoriteModel épingle en queue et retire, immuable", () => {
    expect(toggleFavoriteModel(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleFavoriteModel(["a", "b"], "a")).toEqual(["b"]);
    const src = ["a"];
    toggleFavoriteModel(src, "b");
    expect(src).toEqual(["a"]); // l'original n'est pas muté
  });

  // ⚠️ LE BUG DU 14/08 : sur une liste vide (= le défaut affiché tout étoilé), retirer
  // l'un des 5 doit laisser les 4 AUTRES, jamais réduire au seul id touché. Le premier
  // geste matérialise donc le défaut catalogue.
  it("retirer un favori affiché quand la liste est vide laisse les AUTRES (matérialise)", () => {
    const out = toggleFavoriteModel(undefined, SIMPLE_MODEL_IDS[0]);
    expect(out).toEqual(SIMPLE_MODEL_IDS.filter((id) => id !== SIMPLE_MODEL_IDS[0]));
    expect(out).toHaveLength(SIMPLE_MODEL_IDS.length - 1);
  });

  it("ajouter un NOUVEAU modèle sur une liste vide part du défaut + le nouveau", () => {
    const nouveau = MODELS.find(
      (m) => m.provider === "openrouter" && !SIMPLE_MODEL_IDS.includes(m.id),
    )!.id;
    expect(toggleFavoriteModel(undefined, nouveau)).toEqual([...SIMPLE_MODEL_IDS, nouveau]);
  });

  it("tout retirer re-bascule sur le défaut (une liste vide = réinitialiser)", () => {
    // en enlevant les ids un à un, on finit à [] — que `favoriteSourceIds`/`simpleMenuModels`
    // relisent comme le défaut catalogue.
    let fav: string[] = [...SIMPLE_MODEL_IDS];
    for (const id of [...SIMPLE_MODEL_IDS]) fav = toggleFavoriteModel(fav, id);
    expect(fav).toEqual([]);
    expect(simpleMenuModels(ALL, "", fav).map((m) => m.id)).toEqual([...SIMPLE_MODEL_IDS]);
  });
});

/**
 * Les BLOCS de la liste courte (18/08) — une liste de cinq lignes identiques ne dit pas
 * pourquoi ces cinq-là. Ce que ces cas tiennent : l'ORDRE (le défaut en tête, où qu'il
 * soit épinglé) et l'absence de bloc vide, qui serait un intitulé sans rien dessous.
 */
describe("simpleMenuSections — ce que chaque bloc annonce", () => {
  const m = (id: string) => ({ id, label: id, provider: "openrouter" }) as ModelInfo;

  it("sort le DÉFAUT de la liste des favoris et le met en tête", () => {
    const models = [m("a"), m("def"), m("b")];
    const sec = simpleMenuSections(models, { favSet: new Set(["a", "def", "b"]), defaultId: "def" }, fr);
    expect(sec.map((s) => [s.label, s.models.map((x) => x.id)])).toEqual([
      ["Par défaut", ["def"]],
      ["Favoris", ["a", "b"]],
    ]);
  });

  it("annonce le modèle en cours ajouté en queue, hors favoris", () => {
    const sec = simpleMenuSections([m("a"), m("cur")], { favSet: new Set(["a"]), defaultId: "a" }, fr);
    expect(sec.map((s) => s.label)).toEqual(["Par défaut", "Modèle en cours"]);
    expect(sec[1].models.map((x) => x.id)).toEqual(["cur"]);
  });

  it("aucun bloc VIDE : un intitulé sans ligne dessous est du bruit", () => {
    // Défaut inconnu de la liste ⇒ pas de bloc « Par défaut ».
    expect(simpleMenuSections([m("a")], { favSet: new Set(["a"]), defaultId: "zzz" }, fr)).toEqual([
      { label: "Favoris", models: [m("a")] },
    ]);
    // Un seul favori, qui EST le défaut ⇒ un seul bloc, pas un « Favoris » vide.
    expect(
      simpleMenuSections([m("a")], { favSet: new Set(["a"]), defaultId: "a" }, fr).map((s) => s.label),
    ).toEqual(["Par défaut"]);
    expect(simpleMenuSections([], { favSet: new Set(), defaultId: "a" }, fr)).toEqual([]);
  });

  it("le modèle courant qui est AUSSI le défaut reste « Modèle en cours »", () => {
    // Il n'est pas épinglé : ce qui compte à cet endroit de la liste est qu'il vienne de
    // la conversation, pas des favoris.
    const sec = simpleMenuSections([m("a"), m("cur")], { favSet: new Set(["a"]), defaultId: "cur" }, fr);
    expect(sec.map((s) => s.label)).toEqual(["Favoris", "Modèle en cours"]);
  });
});
