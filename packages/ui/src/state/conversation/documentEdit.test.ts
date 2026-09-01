import { describe, expect, it } from "vitest";
import { documentFences, replaceDocumentInContent } from "./documentEdit";

const DOC = "# Lettre\n\nBonjour Marceline,\n\nCordialement.";
const MSG = `Voici votre lettre :\n\n\`\`\`document\n${DOC}\n\`\`\`\n\nDites-moi si ça convient.`;

describe("documentFences", () => {
  it("trouve le fence et son texte intérieur exact", () => {
    const f = documentFences(MSG);
    expect(f).toHaveLength(1);
    expect(f[0]!.inner).toBe(`${DOC}\n`);
  });
  it("plusieurs fences → tous, dans l'ordre", () => {
    const two = "```document\n# A\n```\n\ntexte\n\n```document\n# B\n```\n";
    expect(documentFences(two).map((f) => f.inner)).toEqual(["# A\n", "# B\n"]);
  });
  it("un fence non fermé (streaming) court jusqu'à la fin", () => {
    const open = "intro\n\n```document\n# En cours";
    expect(documentFences(open)[0]!.inner).toBe("# En cours");
  });
  it("un ``` en PLEIN texte (pas en début de ligne) ne ferme pas le fence", () => {
    const c = "```document\navant ``` après\n```\n";
    expect(documentFences(c)[0]!.inner).toBe("avant ``` après\n");
  });
});

describe("replaceDocumentInContent", () => {
  it("remplace l'intérieur et préserve TOUT le reste octet pour octet", () => {
    const out = replaceDocumentInContent(MSG, DOC, "# Lettre\n\nBonjour Solange,");
    expect(out).toBe(
      "Voici votre lettre :\n\n```document\n# Lettre\n\nBonjour Solange,\n```\n\nDites-moi si ça convient.",
    );
  });
  it("tolère le \\n final que le rendu ajoute au texte du fence", () => {
    expect(replaceDocumentInContent(MSG, `${DOC}\n`, "# X")).toContain("```document\n# X\n```");
  });
  it("FAIL CLOSED : aucun fence ne matche → null, contenu intact", () => {
    expect(replaceDocumentInContent(MSG, "autre texte", "# X")).toBeNull();
  });
  it("deux fences : seul celui qui matche est remplacé", () => {
    const two = "```document\n# A\n```\nmilieu\n```document\n# B\n```\n";
    expect(replaceDocumentInContent(two, "# B", "# B2")).toBe(
      "```document\n# A\n```\nmilieu\n```document\n# B2\n```\n",
    );
  });
  it("la nouvelle version garde le fence fermant sur sa propre ligne", () => {
    const out = replaceDocumentInContent(MSG, DOC, "# Sans newline final");
    expect(out).toContain("# Sans newline final\n```");
  });
});
