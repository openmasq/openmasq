import { describe, it, expect } from "vitest";
import { applyEdit, revisionOf, takeLines } from "./fileEdit";

describe("applyEdit — jamais d'écriture devinée", () => {
  it("remplace l'occurrence unique et laisse le reste octet pour octet", () => {
    const before = "const a = 1;\nconst b = 2;\nconst c = 3;\n";
    const { content, occurrences } = applyEdit(before, "const b = 2;", "const b = 42;");
    expect(occurrences).toBe(1);
    expect(content).toBe("const a = 1;\nconst b = 42;\nconst c = 3;\n");
  });

  it("REFUSE quand le passage est introuvable (lecture périmée ou paraphrasée)", () => {
    // The dangerous alternative is a tool that reports success having changed nothing —
    // the model then builds its next steps on an edit that never happened.
    expect(() => applyEdit("bonjour", "au revoir", "salut")).toThrow(/introuvable/i);
  });

  it("REFUSE une correspondance AMBIGUË plutôt que d'en choisir une", () => {
    expect(() => applyEdit("x\nx\n", "x", "y")).toThrow(/2 fois/);
  });

  it("`replaceAll` lève l'ambiguïté explicitement", () => {
    const { content, occurrences } = applyEdit("x\nx\nz\n", "x", "y", true);
    expect(occurrences).toBe(2);
    expect(content).toBe("y\ny\nz\n");
  });

  it("REFUSE un `oldText` vide (il correspondrait partout)", () => {
    expect(() => applyEdit("abc", "", "z")).toThrow(/vide/i);
  });

  it("REFUSE un remplacement identique (un no-op annoncé comme une édition est un mensonge)", () => {
    expect(() => applyEdit("abc", "b", "b")).toThrow(/identiques/i);
  });

  it("la correspondance est EXACTE — pas de regex, pas de normalisation", () => {
    // `oldText` comes from the model. If it matched loosely this would be an arbitrary
    // rewrite primitive over the user's files, not an editor.
    expect(() => applyEdit("a.b", "a.b".replace(".", "\\."), "z")).toThrow(/introuvable/i);
    expect(() => applyEdit("  indenté", "indenté ", "z")).toThrow(/introuvable/i);
    expect(applyEdit("a.b", "a.b", "z").content).toBe("z");
  });

  it("préserve les fins de ligne CRLF du passage inchangé", () => {
    const { content } = applyEdit("un\r\ndeux\r\ntrois\r\n", "deux", "DEUX");
    expect(content).toBe("un\r\nDEUX\r\ntrois\r\n");
  });
});

describe("revisionOf", () => {
  it("change dès que la taille ou la mtime change", () => {
    const base = revisionOf({ mtimeMs: 1_700_000_000_123.7, size: 42 });
    expect(base).toBe("1700000000123:42");
    expect(revisionOf({ mtimeMs: 1_700_000_000_123.7, size: 43 })).not.toBe(base);
    expect(revisionOf({ mtimeMs: 1_700_000_000_124, size: 42 })).not.toBe(base);
  });

  it("est stable pour un fichier inchangé (la fraction de mtime est tronquée)", () => {
    // Filesystems report mtime at different precisions; a revision that flickered on
    // re-stat would refuse every write and teach the model to always pass `force`.
    expect(revisionOf({ mtimeMs: 1_700_000_000_123.9, size: 42 })).toBe(
      revisionOf({ mtimeMs: 1_700_000_000_123.1, size: 42 }),
    );
  });
});

describe("takeLines — la pagination borne la MÉMOIRE, pas seulement la sortie", () => {
  const file = ["l1", "l2", "l3", "l4", "l5"];

  it("rend la fenêtre demandée, en numérotation 1-based", async () => {
    const slice = await takeLines(file, 2, 2, 1_000);
    expect(slice.text).toBe("l2\nl3");
    expect([slice.from, slice.to]).toEqual([2, 3]);
    expect(slice.reachedEnd).toBe(false);
  });

  it("signale la FIN du fichier — sans quoi le modèle croit avoir tout lu", async () => {
    const slice = await takeLines(file, 4, 10, 1_000);
    expect(slice.text).toBe("l4\nl5");
    expect(slice.reachedEnd).toBe(true);
  });

  it("s'arrête sur le plafond d'octets et le DIT", async () => {
    const slice = await takeLines(file, 1, 100, 6); // "l1\n" + "l2\n" = 6 octets
    expect(slice.text).toBe("l1\nl2");
    expect(slice.cappedByBytes).toBe(true);
    expect(slice.reachedEnd).toBe(false);
  });

  it("une fenêtre au-delà de la fin rend du vide, pas une erreur", async () => {
    const slice = await takeLines(file, 99, 10, 1_000);
    expect(slice.text).toBe("");
    expect([slice.from, slice.to]).toEqual([0, 0]);
  });

  it("une ligne unique plus grosse que le plafond est rendue quand même", async () => {
    // Otherwise a file whose first line exceeds the cap would be permanently unreadable
    // — the exact dead end paging exists to remove.
    const slice = await takeLines(["x".repeat(50)], 1, 1, 10);
    expect(slice.text).toHaveLength(50);
  });

  it("accepte un flux ASYNC (le worker) comme un tableau (les tests)", async () => {
    async function* stream() {
      yield "a";
      yield "b";
    }
    expect((await takeLines(stream(), 1, 5, 1_000)).text).toBe("a\nb");
  });
});
