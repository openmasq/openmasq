import { describe, it, expect, vi, beforeEach } from "vitest";

// Intercepte la télémétrie : le test vérifie l'ÉMISSION, pas le réseau (aucun ici de
// toute façon — le sink par défaut est un no-op, mais l'assertion doit voir l'appel).
const { captureEvent } = vi.hoisted(() => ({ captureEvent: vi.fn() }));
vi.mock("../../analytics", () => ({ captureEvent }));
import { makeToggleKeep,
  buildDetection,
  detectRegex,
  markAtCaret,
  longTextStats, splitDetected, competencePromptCats, competenceExtraCount,
  previewStatus, type Cat, type Item } from "./composerDetection";

/**
 * ⚠️ REGRESSION — « Règles de redaction » had no effect on the composer.
 *
 * `detectRegex` called `redact` with no options, so a category the user had switched
 * off still highlighted, still produced a chip, and still counted in « N à redact ».
 * On the `patterns` engine this is the ONLY detection layer (`ChatView` passes no
 * `onDetectPii` there), so the rules looked entirely inert. The SEND always honoured
 * them — it was the preview that lied, on the surface whose whole purpose is trust.
 */
describe("detectRegex — the live preview obeys the redaction rules", () => {
  const text = "Écris à marie@exemple.fr au 06 12 34 56 78";

  it("detects everything when no category is disabled", () => {
    const cats = detectRegex(text).map((c) => c.cat).sort();
    expect(cats).toEqual(["email", "phone"]);
  });

  it("does NOT report a category the user turned off", () => {
    const cats = detectRegex(text, ["email"]);
    expect(cats.map((c) => c.cat)).toEqual(["phone"]);
    expect(cats.some((c) => c.value.includes("@"))).toBe(false);
  });

  it("reports nothing when every detected category is off — so the count reads 0", () => {
    expect(detectRegex(text, ["email", "phone"])).toEqual([]);
  });

  it("treats an empty rule list as 'no rule', not as 'everything off'", () => {
    // A conversation with no override yields []; that must not silence detection.
    expect(detectRegex(text, []).length).toBe(2);
    expect(detectRegex(text, undefined).length).toBe(2);
  });

  it("a disabled category leaves its value un-marked in the composer backdrop", () => {
    // End to end through the highlight path: no range → the text stays plain.
    const { items, ranges } = buildDetection(text, detectRegex(text, ["email"]));
    expect(items.some((i) => i.value.includes("@"))).toBe(false);
    const segs = splitDetected(text, ranges, new Set());
    expect(segs.map((s) => s.text).join("")).toBe(text);
    expect(segs.filter((s) => s.mark).some((s) => s.text.includes("@"))).toBe(false);
  });
});

/* UNE pastille par identité, y compris pour une valeur IMBRIQUÉE dans une autre.
   Trouvé au parcours RH (contrat espagnol, 17/08) : sur « DNI 12345678Z » l'aperçu
   affichait DEUX pastilles (« 12345678 » et « 12345678Z ») là où l'envoi n'alloue QU'UN
   faux. Une pastille est cliquable pour « garder en clair » — celle du fragment proposait
   donc de un-redact la moitié d'un numéro national. */
describe("buildDetection — imbrication", () => {
  it("un fragment contenu dans une valeur plus longue ne fait PAS sa propre pastille", () => {
    const text = "DNI 12345678Z du salarié";
    const { items, ranges } = buildDetection(text, [
      { value: "12345678", cat: "national_id" },
      { value: "12345678Z", cat: "national_id" },
    ] as Cat[]);
    expect(items.map((i) => i.value)).toEqual(["12345678Z"]);
    // …et le surlignage reste celui du span LONG, pas deux marques superposées.
    expect(ranges).toHaveLength(1);
    expect(text.slice(ranges[0].start, ranges[0].end)).toBe("12345678Z");
  });

  it("deux valeurs DISTINCTES qui ne se contiennent pas gardent leurs deux pastilles", () => {
    const text = "DNI 12345678Z, NAF 08 7654321 12";
    const { items } = buildDetection(text, [
      { value: "12345678Z", cat: "national_id" },
      { value: "08 7654321 12", cat: "national_id" },
    ] as Cat[]);
    expect(items).toHaveLength(2);
  });
});

describe("splitDetected", () => {
  it("reconstructs the exact input text from its segments", () => {
    const text = "call me at a@b.com or c@d.com";
    const { ranges } = buildDetection(text, [
      { value: "a@b.com", cat: "email" },
      { value: "c@d.com", cat: "email" },
    ] as Cat[]);
    const segs = splitDetected(text, ranges, new Set());
    expect(segs.map((s) => s.text).join("")).toBe(text);
    expect(segs.some((s) => s.mark)).toBe(true);
  });

  it("leaves a kept value in plain text (not marked)", () => {
    const text = "mail a@b.com";
    const { ranges } = buildDetection(text, [{ value: "a@b.com", cat: "email" }] as Cat[]);
    const segs = splitDetected(text, ranges, new Set(["a@b.com"]));
    expect(segs.every((s) => !s.mark)).toBe(true);
    expect(segs.map((s) => s.text).join("")).toBe(text);
  });

  it("clamps stale ranges past the text end without corrupting output", () => {
    const text = "short";
    const segs = splitDetected(text, [{ start: 2, end: 999, value: "ort", hue: "coral" }], new Set());
    expect(segs.map((s) => s.text).join("")).toBe(text);
  });
});

describe("buildDetection", () => {
  it("emits one chip per distinct value and a range per occurrence", () => {
    const text = "x@y.com then x@y.com again";
    const { items, ranges } = buildDetection(text, [
      { value: "x@y.com", cat: "email" },
      { value: "x@y.com", cat: "email" },
    ] as Cat[]);
    expect(items).toHaveLength(1); // deduped by value
    expect(ranges.length).toBeGreaterThanOrEqual(2); // one per occurrence
  });

  it("drops a value absent from the text (no lingering chip)", () => {
    const { items } = buildDetection("nothing here", [{ value: "ghost@x.com", cat: "email" }] as Cat[]);
    expect(items).toHaveLength(0);
  });

  it("un même terme revendiqué sous DEUX catégories rend UNE pastille — la première gagne", () => {
    // Vécu (parcours juriste 13/08) : « Projet Ambre » au Coffre (pseudo, fusionné en
    // premier) ET reclassé « company » par la couche modèle → deux pastilles de teintes
    // différentes + « 2 à redact » au-dessus d'UN terme protégé, pendant que le fil,
    // lui, n'allouait qu'UN faux. L'identité d'une entité EST sa clé de dédoublonnage ;
    // la catégorie de la première revendication fixe la teinte.
    const text = "Le dossier Projet Ambre avance ; archive Projet Ambre.";
    const { items, ranges } = buildDetection(text, [
      { value: "Projet Ambre", cat: "username" },
      { value: "Projet Ambre", cat: "company" },
    ] as Cat[]);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("username");
    // Les DEUX occurrences restent surlignées — dédupliquer la pastille ne perd pas de marque.
    expect(ranges.filter((r) => r.value.includes("Ambre"))).toHaveLength(2);
  });
});

describe("markAtCaret — the click-to-keep gesture", () => {
  const ranges = [
    { start: 10, end: 17, value: "x@y.com", hue: "sky" },
    { start: 30, end: 41, value: "Karl Studio", hue: "violet" },
  ];
  const none = new Set<string>();

  it("returns the mark whose span contains the caret (end inclusive — caret lands after the last char)", () => {
    expect(markAtCaret(ranges, none, 12)?.value).toBe("x@y.com");
    expect(markAtCaret(ranges, none, 17)?.value).toBe("x@y.com");
    expect(markAtCaret(ranges, none, 30)?.value).toBe("Karl Studio");
  });

  it("returns null outside every mark, for a negative caret, and for a KEPT value", () => {
    expect(markAtCaret(ranges, none, 5)).toBeNull();
    expect(markAtCaret(ranges, none, -1)).toBeNull();
    expect(markAtCaret(ranges, new Set(["x@y.com"]), 12)).toBeNull();
  });
});

describe("longTextStats — the collapsed-card summary", () => {
  it("counts chars/lines and previews the first non-empty line, ellipsed", () => {
    const s = longTextStats("\n# Titre du document\n" + "corps ".repeat(50) + "\nfin");
    expect(s.lines).toBeGreaterThan(2);
    expect(s.preview).toBe("# Titre du document");
    const long = longTextStats("a".repeat(300));
    expect(long.preview.endsWith("…")).toBe(true);
    expect(long.preview.length).toBeLessThanOrEqual(121);
  });
});

describe("« à vérifier » (uncertain) — la couche modèle marque, une source sûre gagne", () => {
  it("propage le flag du Cat jusqu'aux chips ET aux ranges du miroir", () => {
    const text = "Le dossier de Norvatek est prêt.";
    const { items, ranges } = buildDetection(text, [
      { value: "Norvatek", cat: "company", uncertain: true },
    ] as Cat[]);
    expect(items[0]).toMatchObject({ value: "Norvatek", uncertain: true });
    expect(ranges[0]).toMatchObject({ value: "Norvatek", uncertain: true });
  });

  it("une source SÛRE du même identifiant gagne le dédoublonnage — pas de doute affiché", () => {
    // Ordre de fusion du composeur : forced puis regex puis modèle. Le premier arrivé
    // fixe l'état de la chip, donc une valeur revendiquée par une source sûre ne porte
    // jamais « à vérifier », même si la couche modèle doute.
    const text = "Contact : Norvatek pour la suite.";
    const { items } = buildDetection(text, [
      { value: "Norvatek", cat: "company" },
      { value: "Norvatek", cat: "company", uncertain: true },
    ] as Cat[]);
    expect(items).toHaveLength(1);
    expect(items[0].uncertain).toBeUndefined();
  });

  it("le flag traverse splitDetected jusqu'au segment du miroir", () => {
    const text = "Voir Norvatek demain.";
    const { ranges } = buildDetection(text, [
      { value: "Norvatek", cat: "company", uncertain: true },
    ] as Cat[]);
    const segs = splitDetected(text, ranges, new Set());
    const mark = segs.find((s) => s.mark);
    expect(mark).toMatchObject({ text: "Norvatek", uncertain: true });
  });
});

describe("makeToggleKeep — le geste « garder en clair » est un signal de faux positif", () => {
  const items = [{ value: "Elena Sohn", hue: "pink", kind: "name" }];
  beforeEach(() => captureEvent.mockReset());

  it("émet la CATÉGORIE (jamais la valeur) quand le keep s'active", () => {
    const setKeepList = vi.fn();
    makeToggleKeep(items, new Set(), setKeepList)("Elena Sohn");
    expect(captureEvent).toHaveBeenCalledWith({ name: "redaction_kept", kind: "name" });
    // La valeur ne doit apparaître dans AUCUN champ de l'événement.
    expect(JSON.stringify(captureEvent.mock.calls)).not.toContain("Elena");
    expect(setKeepList).toHaveBeenCalledOnce();
  });

  it("re-redact (désactiver le keep) reste muet — ce n'est pas une correction du moteur", () => {
    const setKeepList = vi.fn();
    makeToggleKeep(items, new Set(["Elena Sohn"]), setKeepList)("Elena Sohn");
    expect(captureEvent).not.toHaveBeenCalled();
    expect(setKeepList).toHaveBeenCalledOnce(); // le geste lui-même fonctionne toujours
  });

  it("une valeur sans item (course du debounce) émet `unknown` plutôt que rien", () => {
    makeToggleKeep(items, new Set(), vi.fn())("valeur-disparue");
    expect(captureEvent).toHaveBeenCalledWith({ name: "redaction_kept", kind: "unknown" });
  });

  it("le toggle conserve la sémantique d'origine (ajoute puis retire)", () => {
    let list: string[] = [];
    const setKeepList = (fn: (prev: string[]) => string[]) => { list = fn(list); };
    const toggle = makeToggleKeep(items, new Set(), setKeepList);
    toggle("Elena Sohn");
    expect(list).toEqual(["Elena Sohn"]);
    makeToggleKeep(items, new Set(list), setKeepList)("Elena Sohn");
    expect(list).toEqual([]);
  });
});

describe("competencePromptCats — le prompt d'une compétence nourrit le compteur", () => {
  // Vécu 15/08 (parcours G) : une compétence portant les coordonnées du cabinet — SIRET,
  // e-mail, téléphone — était mise en scène, le composeur annonçait « 1 à redact »
  // quand 8 partaient masqués. Le prompt part dans modelText : le compteur doit le dire.
  const PROMPT =
    "Tu écris au nom du cabinet. Contact : farid.sellam@tarvelone-expertise.fr, 02 98 44 17 62.";

  it("détecte les valeurs du prompt (regex, synchrone)", () => {
    const cats = competencePromptCats(PROMPT);
    const values = cats.map((c) => c.value);
    expect(values).toContain("farid.sellam@tarvelone-expertise.fr");
    expect(values).toContain("02 98 44 17 62");
  });

  it("préview absente ou vide ⇒ rien (et jamais d'exception)", () => {
    expect(competencePromptCats(undefined)).toEqual([]);
    expect(competencePromptCats("   ")).toEqual([]);
  });

  it("honore les catégories désactivées, comme le brouillon", () => {
    const values = competencePromptCats(PROMPT, ["phone"]).map((c) => c.value);
    expect(values).not.toContain("02 98 44 17 62");
    expect(values).toContain("farid.sellam@tarvelone-expertise.fr");
  });
});

describe("competenceExtraCount — dédupliqué contre le brouillon", () => {
  const item = (value: string): Item => ({ value, hue: "blue", kind: "email" });

  it("compte les valeurs distinctes du prompt absentes du brouillon", () => {
    const compCats = [
      { value: "a@b.fr", cat: "email" },
      { value: "a@b.fr", cat: "email" }, // doublon interne
      { value: "06 11 22 33 44", cat: "phone" },
    ];
    expect(competenceExtraCount([], compCats)).toBe(2);
    // La même valeur déjà comptée par le brouillon ne fait pas deux (casse pliée).
    expect(competenceExtraCount([item("A@B.FR")], compCats)).toBe(1);
  });

  it("compétence sans valeur sensible ⇒ zéro ajouté", () => {
    expect(competenceExtraCount([item("x@y.fr")], [])).toBe(0);
  });
});

describe("previewStatus — FINI vs ABANDONNÉ (document long, 15/08)", () => {
  // Mesuré : 41 872 caractères ⇒ la couche sémantique rend les armes, `detecting`
  // retombe à faux, et « 321 à redact » s'affichait comme un TOTAL alors qu'il ne
  // portait que les règles (e-mails + téléphones + SIREN) — ni l'adresse du cabinet ni
  // les noms de personnes, pourtant détectés sur le même texte en court.
  it("analyse complète ⇒ un compte ferme, sans explication à donner", () => {
    const s = previewStatus(false, 321, true);
    expect(s).toEqual({ kind: "count", label: "321 à redact" });
  });

  it("analyse ABANDONNÉE ⇒ « au moins N », marqué partiel, avec l'explication", () => {
    const s = previewStatus(false, 321, true, true);
    expect(s.kind).toBe("count");
    if (s.kind !== "count") return;
    expect(s.label).toBe("au moins 321 à redact");
    expect(s.partial).toBe(true);
    // L'explication doit RASSURER sur ce qui compte : l'envoi ré-analyse tout.
    expect(s.hint).toMatch(/envoi la refait/i);
  });

  it("abandon SANS aucune détection ⇒ on le dit, on ne se tait pas", () => {
    // Se taire se lirait « rien à redact » sur un document qu'on n'a pas fini de lire.
    const s = previewStatus(false, 0, true, true);
    expect(s.kind).toBe("count");
    if (s.kind !== "count") return;
    expect(s.label).toBe("analyse incomplète");
    expect(s.partial).toBe(true);
  });

  it("pendant l'analyse : toujours le silence (c'est le bouton qui parle)", () => {
    expect(previewStatus(true, 321, true).kind).toBe("none");
    expect(previewStatus(true, 321, true, true).kind).toBe("none");
  });

  it("zéro détection sur une analyse COMPLÈTE reste silencieux, comme avant", () => {
    expect(previewStatus(false, 0, true).kind).toBe("none");
    expect(previewStatus(false, 5, false).kind).toBe("none");
  });
});
