// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { escapeInline, inlineFromNode, inlineToNodes, tokenizeInline } from "./inline";
import { blocksToDom, blocksToMarkdown, domToMarkdown, parseBlocks } from "./blocks";
import { blockRuleFor, enterEndsBlock, markForChord, typeAfterEnter } from "./typing";

/**
 * The editor edits a WYSIWYG surface but STORES markdown, so the only invariant that
 * matters is: md → DOM → md is the identity. Everything else is comfort; this is the
 * difference between "the user typed it" and "the document kept it".
 */
const roundTrip = (md: string): string => {
  const host = document.createElement("div");
  host.appendChild(blocksToDom(parseBlocks(md), document));
  return domToMarkdown(host);
};

describe("inline marks", () => {
  it("`**` wins over `*` — bold is never read as two italics", () => {
    expect(tokenizeInline("**gras**").map((t) => t.kind)).toEqual(["strong"]);
    expect(tokenizeInline("*italique*").map((t) => t.kind)).toEqual(["em"]);
  });

  it("a code span keeps `*` literal", () => {
    const toks = tokenizeInline("`a * b`");
    expect(toks).toEqual([{ kind: "code", text: "a * b" }]);
  });

  it("an escaped mark stays literal, and comes back escaped", () => {
    expect(tokenizeInline("2 \\* 3")).toEqual([{ kind: "text", text: "2 * 3" }]);
    expect(escapeInline("2 * 3")).toBe("2 \\* 3");
  });

  it("reads the tags a BROWSER produces for ⌘B/⌘I, not only the ones we emit", () => {
    const host = document.createElement("div");
    host.innerHTML = "<b>gras</b> et <i>italique</i>";
    expect(Array.from(host.childNodes).map(inlineFromNode).join("")).toBe("**gras** et *italique*");
  });

  it("a link round-trips with its href", () => {
    const host = document.createElement("div");
    for (const n of inlineToNodes("voir [le site](https://exemple.fr)", document)) host.appendChild(n);
    expect(Array.from(host.childNodes).map(inlineFromNode).join("")).toBe(
      "voir [le site](https://exemple.fr)",
    );
  });

  it("an EMPTY mark is dropped rather than emitted as `****`", () => {
    const host = document.createElement("div");
    host.innerHTML = "<strong></strong>texte";
    expect(Array.from(host.childNodes).map(inlineFromNode).join("")).toBe("texte");
  });
});

describe("blocks — the md → DOM → md round-trip", () => {
  it("keeps a whole letter identical", () => {
    const md = [
      "# Email de remerciement",
      "",
      "Bonjour Julien,",
      "",
      "Je tenais à te remercier pour **ton aide** sur le projet.",
      "",
      "## Ce que ça change",
      "",
      "- Un gain de temps réel",
      "- Une **vraie** clarté",
      "",
      "> Merci encore.",
      "",
      "À très bientôt,",
      "",
      "Claire",
      "",
    ].join("\n");
    expect(roundTrip(md)).toBe(md);
  });

  it("does NOT grow blank lines on repeated saves (the drift that reflows a document)", () => {
    const md = "Bonjour,\n\nUn paragraphe.\n";
    const once = roundTrip(md);
    expect(roundTrip(once)).toBe(once);
    expect(roundTrip(roundTrip(once))).toBe(once);
  });

  // This test asserted the opposite — « renumbers on the source side only », hence
  // `1. un\n1. deux`. Defensible on the surface (CommonMark renumbers at display time),
  // but the reasoning only held for a list starting at 1: a list
  // authored starting at 3 visibly restarted at 1. The number is therefore kept, which
  // incidentally makes the round trip identity-preserving.
  it("garde le numéro de départ d'une liste ordonnée — 3. ne redevient pas 1.", () => {
    expect(roundTrip("1. un\n2. deux\n")).toBe("1. un\n2. deux\n");
    expect(roundTrip("3. trois\n4. quatre\n")).toBe("3. trois\n4. quatre\n");
  });

  it("a fenced code block keeps its content verbatim, marks included", () => {
    expect(roundTrip("```\nconst a = **x**;\n```\n")).toBe("```\nconst a = **x**;\n```\n");
  });

  it("an EMPTY document stays one empty paragraph, never zero blocks", () => {
    expect(parseBlocks("")).toEqual([{ type: "p", text: "" }]);
  });

  it("unknown markup degrades to a paragraph of its TEXT — never to nothing", () => {
    const host = document.createElement("div");
    host.innerHTML = "<section>du texte rescapé</section>";
    expect(domToMarkdown(host)).toBe("du texte rescapé\n");
  });

  it("a browser's bare <div> on Enter still round-trips (data-b wins over the tag)", () => {
    const host = document.createElement("div");
    host.innerHTML = '<h2 data-b="h2">Titre</h2><div>Une ligne tapée après Entrée</div>';
    expect(domToMarkdown(host)).toBe("## Titre\n\nUne ligne tapée après Entrée\n");
  });

  it("an empty block's <br> is a line box, not a newline in the source", () => {
    const host = document.createElement("div");
    host.innerHTML = '<p data-b="p">Un</p><p data-b="p"><br></p><p data-b="p">Deux</p>';
    expect(domToMarkdown(host)).toBe("Un\n\nDeux\n");
  });

  // Regression: a continuation line opened a NEW paragraph, so
  // `blocksToMarkdown` inserted a blank line and the first save split the
  // paragraph in two. Invisible in the first test's letter, whose
  // paragraphs are already all separated by blank lines — it's the SOFT wrap that
  // broke, and that's how a model writes a letter.
  it("un repli souple reste UN paragraphe — la sauvegarde n'ajoute pas de ligne vide", () => {
    const md = "Bonjour Madame,\nSuite à notre échange du 12,\nje vous confirme.\n";
    expect(blocksToMarkdown(parseBlocks(md))).toBe(md);
  });

  it("une ligne vide sépare toujours deux VRAIS paragraphes", () => {
    const md = "Premier paragraphe.\n\nSecond paragraphe.\n";
    expect(blocksToMarkdown(parseBlocks(md))).toBe(md);
  });

  it("le repli souple survit à un aller-retour par le DOM", () => {
    const md = "Bonjour,\nà bientôt.\n";
    const host = document.createElement("div");
    host.appendChild(blocksToDom(parseBlocks(md), document));
    expect(domToMarkdown(host)).toBe(md);
  });

  it("un bloc de code garde son LANGAGE — sans lui la carte perd sa coloration", () => {
    expect(roundTrip("```js\nconst a = 1;\n```\n")).toBe("```js\nconst a = 1;\n```\n");
    // And a fence with no language doesn't invent one.
    expect(roundTrip("```\nbrut\n```\n")).toBe("```\nbrut\n```\n");
  });

  it("une citation sur plusieurs lignes reste UNE citation", () => {
    expect(roundTrip("> ligne un\n> ligne deux\n")).toBe("> ligne un\n> ligne deux\n");
    // …and two genuinely separate quotes stay that way.
    expect(roundTrip("> une\n\n> deux\n")).toBe("> une\n\n> deux\n");
  });

  // The editor models neither nesting nor an indented code block. The CLAUDE.md
  // promises that an unsupported construct « reste du TEXTE LITTÉRAL et survit à
  // l'aller-retour »: it didn't survive — a blank line got inserted, and the final
  // `.trim()` ate the indentation of a document that STARTS with an indented line.
  it("un construit non modélisé survit VERBATIM — c'est le seul échec acceptable", () => {
    expect(roundTrip("- parent\n  - enfant\n")).toBe("- parent\n  - enfant\n");
    expect(roundTrip("    texte indenté\n")).toBe("    texte indenté\n");
  });

  it("une continuation ne traverse ni un titre ni une puce", () => {
    // A heading closes its block: the following line is a paragraph, not its continuation.
    expect(blocksToMarkdown(parseBlocks("# Titre\nUn texte.\n"))).toBe("# Titre\n\nUn texte.\n");
    // And a line after a bullet does open a paragraph, without absorbing the bullet.
    expect(blocksToMarkdown(parseBlocks("- un\nUne phrase.\n"))).toBe("- un\n\nUne phrase.\n");
  });
});

describe("typing rules — the Notion feel", () => {
  it("a shorthand at the start of a block becomes that block on SPACE", () => {
    expect(blockRuleFor("#")).toBe("h1");
    expect(blockRuleFor("###")).toBe("h3");
    expect(blockRuleFor("-")).toBe("ul");
    expect(blockRuleFor("1.")).toBe("ol");
    expect(blockRuleFor("4)")).toBe("ol");
    expect(blockRuleFor(">")).toBe("quote");
    expect(blockRuleFor("```")).toBe("code");
  });

  it("mid-block text is NOT a shorthand — a `#` in a sentence stays a `#`", () => {
    expect(blockRuleFor("le # de la rue")).toBeNull();
    expect(blockRuleFor("####")).toBeNull(); // h4+ is not a level this document has
  });

  it("Enter continues a LIST and drops everything else back to a paragraph", () => {
    expect(typeAfterEnter("ul", false)).toBe("ul");
    expect(typeAfterEnter("ol", false)).toBe("ol");
    // The single most common gesture: a paragraph under a heading.
    expect(typeAfterEnter("h1", false)).toBe("p");
    expect(typeAfterEnter("quote", false)).toBe("p");
  });

  it("Enter on an EMPTY list item or quote ends the construct instead of extending it", () => {
    expect(enterEndsBlock("ul", true)).toBe(true);
    expect(enterEndsBlock("quote", true)).toBe(true);
    expect(enterEndsBlock("ul", false)).toBe(false);
    expect(enterEndsBlock("h1", true)).toBe(false); // a heading has nothing to end
  });

  it("⌘B / ⌘I / ⌘E map to the three marks, and a bare key maps to none", () => {
    expect(markForChord({ key: "b", metaKey: true, ctrlKey: false })).toBe("bold");
    expect(markForChord({ key: "I", metaKey: false, ctrlKey: true })).toBe("italic");
    expect(markForChord({ key: "e", metaKey: true, ctrlKey: false })).toBe("code");
    expect(markForChord({ key: "b", metaKey: false, ctrlKey: false })).toBeNull();
    expect(markForChord({ key: "b", metaKey: true, ctrlKey: false, altKey: true })).toBeNull();
  });
});
