import { describe, expect, it } from "vitest";
import { FAKE_FIRST, FAKE_FIRST_M, FAKE_FIRST_F, FAKE_LAST, fakeFor } from "./fakes";
import { isNonPiiTerm, isStopword } from "./genericTerms";
import { isNotoriousEntity } from "./notorious";
import { nameGender } from "./gender";

/* L'AUDIT DES POOLS DE FAUX NOMS.
 *
 * Un faux nom n'a pas seulement à être plausible : il doit être RARE. NAME et EMAIL sont
 * exemptés de `collidesAvoid` (`pseudonymize/allocate.ts` `skipAvoid`), donc rien ne
 * protège un faux contre ce que l'utilisateur écrira plus tard dans la conversation — le
 * pool EST la défense. Ces règles sont mécaniques exprès : « on a choisi des noms rares »
 * est une intention, `expect` est une garantie.
 *
 * Chaque règle correspond à une collision observée ou évidente, pas à une préférence. */

const ALL = [...FAKE_FIRST, ...FAKE_LAST];
const lower = (s: string) => s.toLowerCase();

/** Le palmarès français — prénoms et patronymes les plus portés. Un faux pris là-dedans
 *  rencontre une VRAIE personne du même nom dans la conversation, et la restitution
 *  attribue alors la valeur de l'un à l'autre. C'est la version vérifiable de « rare ». */
const TOO_COMMON = new Set(
  (
    // prénoms (toutes générations confondues)
    "marie jean pierre michel andré philippe rené louis alain jacques bernard marcel " +
    "daniel roger robert paul henri georges joseph raymond françois christian gérard " +
    "claude julien nicolas julien david sébastien stéphane laurent olivier patrick " +
    "jeanne monique catherine françoise nathalie isabelle sylvie martine nicole " +
    "christine véronique sandrine valérie céline stéphanie aurélie julie émilie laura " +
    "claire sophie camille manon léa emma chloé sarah alice clara louise juliette " +
    "charlotte anna rose jade inès lina lucas hugo théo léo tom noah adam jules " +
    "arthur antoine nathan ethan simon marc éric pascal frédéric vincent " +
    // patronymes
    "martin bernard julien petit robert richard durand dubois moreau laurent simon " +
    "michel lefebvre leroy roux david bertrand morel fournier girard bonnet dupont " +
    "lambert fontaine rousseau vincent muller lefevre faure andre mercier blanc " +
    "guerin boyer garnier chevalier françois legrand gauthier garcia perrin robin " +
    "clement morin nicolas henry roussel mathieu duval denis marchand lemaire"
  ).split(" "),
);

/** Homonymes de personnalités que deux moitiés anodines pouvaient composer. « Paul Simon »
 *  sortait des anciens pools ; un modèle qui navigue part alors chercher le musicien. */
const FAMOUS_FULL_NAMES = new Set([
  "paul simon", "louis garcia", "marc dupont", "jean moulin", "claude françois",
  "charlotte gainsbourg", "louis vuitton", "pierre bernard", "julien pesquet",
  "emma watson", "sarah bernhardt", "alice cooper", "anna karina", "jules verne",
  "arthur rimbaud", "simone veil", "marcel proust", "odilon redon", "marcel marceau",
]);

describe("pools de faux noms — rares, jamais des mots, jamais des célébrités", () => {
  it("aucun faux n'est un mot ordinaire ni un mot-outil", () => {
    // « Rose », « Jade », « Petit », « Roux » : le faux devient une entrée de coffre qui
    // re-redacted ensuite un mot anodin de la conversation — ou pire, la passe inverse
    // réécrit ce mot anodin en une vraie valeur.
    for (const n of ALL) {
      expect(isStopword(lower(n)), `${n} est un mot-outil`).toBe(false);
      expect(isNonPiiTerm(n), `${n} est un terme générique / un mot ordinaire`).toBe(false);
    }
  });

  it("aucun faux n'est un nom TRÈS courant", () => {
    // Le cœur de la règle : une conversation d'équipe contient un vrai Martin.
    for (const n of ALL) {
      expect(TOO_COMMON.has(lower(n)), `${n} fait partie des noms les plus portés`).toBe(false);
    }
  });

  it("aucun faux n'est reconnu comme une entité notoire", () => {
    // La notoriété n'est jamais redacted : un faux qui se lit comme une personnalité
    // publique envoie un modèle qui navigue enquêter sur quelqu'un d'autre.
    for (const n of ALL) {
      expect(isNotoriousEntity(n, "NAME"), `${n} est notoire (NAME)`).toBe(false);
      expect(isNotoriousEntity(n, "ORG"), `${n} est notoire (ORG)`).toBe(false);
    }
  });

  it("aucune COMBINAISON prénom + nom ne compose une personnalité", () => {
    for (const f of FAKE_FIRST) {
      for (const l of FAKE_LAST) {
        expect(FAMOUS_FULL_NAMES.has(`${lower(f)} ${lower(l)}`), `${f} ${l}`).toBe(false);
      }
    }
  });

  it("les prénoms et les patronymes sont DISJOINTS", () => {
    // « Simon » était dans les deux : le tirage pouvait produire « Simon Simon », et
    // l'index de mots ne savait plus quelle identité portait le mot.
    const firsts = new Set(FAKE_FIRST.map(lower));
    for (const l of FAKE_LAST) expect(firsts.has(lower(l)), `${l} est aussi un prénom`).toBe(false);
  });

  it("les deux genres sont disjoints, et aucun n'est vide", () => {
    // Un prénom des deux côtés casserait la promesse « le faux garde le genre du vrai ».
    const m = new Set(FAKE_FIRST_M.map(lower));
    for (const f of FAKE_FIRST_F) expect(m.has(lower(f)), `${f} est dans les deux genres`).toBe(false);
    expect(FAKE_FIRST_M.length).toBeGreaterThanOrEqual(12);
    expect(FAKE_FIRST_F.length).toBeGreaterThanOrEqual(12);
    expect(FAKE_LAST.length).toBeGreaterThanOrEqual(12);
  });

  it("aucun faux ne fait moins de 5 caractères", () => {
    // ≤3 caractères en un mot = `isRisky` dans `unredact` : restitution seulement à la
    // casse exacte, donc un faux que le modèle recapitalise ne revient pas. Et un fragment
    // court se colle à l'intérieur d'un autre mot.
    for (const n of ALL) expect(n.length, n).toBeGreaterThanOrEqual(5);
  });

  it("chaque faux reste ALIASABLE (sinon la personne se scinde en deux identités)", () => {
    // `identity/name.ts` `isNamePart` : lettres uniquement, et pas un mot-outil. Un
    // patronyme refusé là (« Petit ») n'est jamais aliasé, donc la forme courte suivante
    // de la même personne reçoit une NOUVELLE identité.
    for (const n of ALL) expect(/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]+$/.test(n), n).toBe(true);
  });

  it("le GENRE de chaque prénom est connu du lexique, et du bon côté", () => {
    // La promesse « le faux garde le genre du vrai » tient par la construction des pools ;
    // celle-ci la rend VÉRIFIABLE de bout en bout. Elle a aussi un effet propre : une
    // vraie personne prénommée « Mahaut » que le lexique ignore retombe sur le pool mixte,
    // et son faux peut alors changer de genre — « Madame … née … elle » sur un homme, un
    // accord qui ne se restitue pas.
    for (const n of FAKE_FIRST_M) expect(nameGender(n), n).toBe("m");
    for (const n of FAKE_FIRST_F) expect(nameGender(n), n).toBe("f");
  });

  it("aucun doublon dans un pool", () => {
    for (const [name, pool] of [["M", FAKE_FIRST_M], ["F", FAKE_FIRST_F], ["LAST", FAKE_LAST]] as const)
      expect(new Set(pool.map(lower)).size, name).toBe(pool.length);
  });
});

/* Le TIRAGE, pas le contenu des pools. Deux pools de 16 ne donnent 256 noms complets que
 * si leurs deux indices sont indépendants — et ils ne l'étaient pas : `pick` est `n % len`,
 * donc tirer les moitiés sur `h` puis `h + 1` verrouillait le patronyme sur le prénom
 * (indice i, puis i+1). Seize noms complets par genre au lieu de 256, le patronyme fonction
 * pure du prénom, et trois conversations tirant le même faux une fois sur 256 — d'où un
 * `evals/workflow.test.ts` rouge qui ne prouvait rien sur le sel. */
describe("tirage d'un nom complet — le patronyme n'est pas une fonction du prénom", () => {
  // Un sel par tirage : c'est exactement l'axe par lequel deux conversations diffèrent.
  const draws = Array.from({ length: 400 }, (_, salt) =>
    fakeFor("NAME", "Augustin Vaudel", 0, undefined, salt),
  );

  it("le vivier des noms complets dépasse la taille d'un seul pool", () => {
    // Avec les indices verrouillés, ce compte valait EXACTEMENT FAKE_LAST.length.
    expect(new Set(draws).size).toBeGreaterThan(FAKE_LAST.length);
  });

  it("un même faux prénom se voit attribuer plusieurs patronymes", () => {
    const byFirst = new Map<string, Set<string>>();
    for (const d of draws) {
      const [first, last] = d.split(" ");
      const seen = byFirst.get(first) ?? new Set<string>();
      seen.add(last);
      byFirst.set(first, seen);
    }
    const widest = Math.max(...[...byFirst.values()].map((s) => s.size));
    expect(widest, "chaque prénom n'a qu'un seul patronyme possible").toBeGreaterThan(1);
  });
});
