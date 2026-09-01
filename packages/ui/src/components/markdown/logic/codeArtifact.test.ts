import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CodeBlock } from "../blocks/CodeBlock";
import { ArtifactProvider } from "../../../containers/providers/artifact";

/** Fake the hast `<pre><code class="language-xxx">text</code></pre>` node
 *  react-markdown passes to CodeBlock. */
const preNode = (lang: string, text: string) => ({
  children: [
    {
      tagName: "code",
      properties: { className: [`language-${lang}`] },
      children: [{ type: "text", value: text }],
    },
  ],
});

const render = (lang: string, text: string): string =>
  renderToStaticMarkup(
    createElement(
      ArtifactProvider,
      { value: { active: null, open: () => {}, close: () => {} } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createElement(CodeBlock as any, { node: preNode(lang, text), children: text }),
    ),
  );

describe("CodeBlock — artifact chips", () => {
  it("renders a CSV fence as a clickable file chip (not inline code)", () => {
    const html = render("csv", "a;b;c\n1;2;3\n4;5;6");
    expect(html).toContain("md-artifact-chip");
    expect(html).toContain("Tableau CSV");
    expect(html).not.toContain("<pre>");
  });

  it("renders a SUBSTANTIAL code fence (>=6 lines) as a chip", () => {
    const html = render("python", "a=1\nb=2\nc=3\nd=4\ne=5\nf=6\n");
    expect(html).toContain("md-artifact-chip");
    expect(html).toContain("Python");
  });

  it("keeps a SHORT code fence inline", () => {
    const html = render("python", "print('hi')");
    expect(html).toContain("md-code");
    expect(html).not.toContain("md-artifact-chip");
  });

  it("renders a ```document fence as a bordered, downloadable card (not code)", () => {
    const html = render("document", "# Rapport Q3\n\nCorps du rapport avec du texte.");
    expect(html).toContain("md-document-card");
    expect(html).toContain("Rapport Q3"); // title in the header
    expect(html).toContain("Télécharger");
    expect(html).not.toContain("md-code");
    expect(html).not.toContain("md-artifact-chip");
  });

  // The two fences the model emits when asked to BUILD a
  // compétence or a workflow (`systemPrompt.ts` SKILL_GUIDANCE): they reach the
  // adoption card, not the code render — that's the end-to-end path.
  it("renders a ```competence fence as an adoption card (not code)", () => {
    const html = render("competence", "# Compte rendu\ndescription: D\n---\nTu rédiges…");
    expect(html).toContain("md-skill-card");
    expect(html).toContain("Compte rendu");
    expect(html).toContain("Compétence");
    expect(html).not.toContain("md-code");
  });

  it("renders a ```workflow fence as an adoption card", () => {
    const html = render("workflow", "# Tri des mails\nconnecteurs: gmail\n---\nTrie…");
    expect(html).toContain("md-skill-card");
    expect(html).toContain("Workflow");
    expect(html).not.toContain("md-code");
  });
});
