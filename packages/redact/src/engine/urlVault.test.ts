import { describe, it, expect } from "vitest";
import { detectHostedUrlSpans, detectUrlSpans, urlOccurrenceGuard } from "./urls";
import { applyVault, replayVault } from "./vault";
import { pseudonymize } from "../index";

// The reported corruption, verbatim in shape: `app` is vaulted from ORDINARY PROSE
// (`packages/app`, « in-app »), and the forward vault pass then rewrote the host of every
// link the Notion / Vercel connectors returned — `https://wP0.notion.com`, `vercel.wP0`.
// The candidate filter's URL gate cannot catch it: it runs on DETECTIONS, before anything
// is vaulted, so an entry minted a turn earlier walks straight past it.
const PAGE = `<page url="https://app.notion.com/p/36bb8e7d42668192b940c761dbfbd7e7">
packages/app/src/pages/community/index.tsx est la surface, in-app.
Vercel URL: https://isaure-starter-turborepo-b8pwi37jx.vercel.app</page>`;

const guardFor = (text: string, exempt: (v: string) => boolean = () => false) =>
  urlOccurrenceGuard(detectUrlSpans(text), exempt);

describe("forward vault passes × URL spans", () => {
  it("REGRESSION — a vaulted value no longer rewrites the inside of a URL", () => {
    const out = applyVault(PAGE, { wP0: "app" }, undefined, guardFor(PAGE));
    expect(out).toContain("https://app.notion.com/p/36bb8e7d42668192b940c761dbfbd7e7");
    expect(out).toContain("vercel.app</page>");
  });

  it("…while the SAME value in prose is still redacted — the guard is per OCCURRENCE", () => {
    const out = applyVault(PAGE, { wP0: "app" }, undefined, guardFor(PAGE));
    expect(out).toContain("packages/wP0/src");
    expect(out).toContain("in-wP0");
  });

  it("no guard ⇒ the historical behaviour, unchanged", () => {
    const out = applyVault(PAGE, { wP0: "app" });
    expect(out).toContain("https://wP0.notion.com");
  });

  it("an EXEMPT kind is still substituted inside a URL (audit H-3 / F2)", () => {
    const text = `Contact : https://crm.example.com/lead?email=jean@rebour.fr`;
    const exempt = (v: string) => v === "jean@rebour.fr"; // what URL_EXEMPT_KINDS proves
    const out = applyVault(text, { "luc@ostrel.fr": "jean@rebour.fr" }, undefined, guardFor(text, exempt));
    expect(out).toContain("email=luc@ostrel.fr");
  });

  it("an UNKNOWN kind is treated as exempt — unknown fails CLOSED, it keeps masking", () => {
    const text = `https://crm.example.com/x/Ostrel`;
    // The caller's predicate answers `true` for anything it cannot prove (the shape
    // `pseudonymize` / `navClearRedact` use), so the value is substituted as before.
    const out = applyVault(text, { Bellac: "Ostrel" }, undefined, guardFor(text, () => true));
    expect(out).toContain("/x/Bellac");
  });

  it("replayVault takes the same guard, judged on the REAL value", () => {
    const text = `Voir https://app.notion.com/p/abc — app est en panne.`;
    const out = replayVault(text, { wP0: "app" }, guardFor(text));
    expect(out).toContain("https://app.notion.com/p/abc");
    expect(out).toContain("wP0 est en panne");
  });

  it("a text with no URL builds no guard at all (no per-candidate scan)", () => {
    expect(guardFor("aucune adresse ici")).toBeUndefined();
  });
});

describe("detectHostedUrlSpans — the connected-integration ALLOW-list", () => {
  const at = (text: string, spans: Array<[number, number]>) => spans.map(([s, e]) => text.slice(s, e));

  it("matches the host and its sub-domains", () => {
    const t = `a https://app.notion.com/p/1 b https://notion.com/x c`;
    expect(at(t, detectHostedUrlSpans(t, ["notion.com"]))).toEqual([
      "https://app.notion.com/p/1",
      "https://notion.com/x",
    ]);
  });

  it("never matches a LOOK-ALIKE host — the suffix must terminate the host", () => {
    const t = `https://notion.com.evil.tld/p/1`;
    expect(detectHostedUrlSpans(t, ["notion.com"])).toEqual([]);
  });

  it("leaves every other host alone, and does nothing with an empty list", () => {
    const t = `https://example.com/p/1`;
    expect(detectHostedUrlSpans(t, ["notion.com"])).toEqual([]);
    expect(detectHostedUrlSpans(t, [])).toEqual([]);
  });
});

describe("pseudonymize end-to-end", () => {
  const NOTION = `Page « Réunion » de Karl Studio : https://app.notion.com/p/2b7c9f?pvs=1`;

  it("a vaulted company stops corrupting a connector's link, and stays redacted in prose", async () => {
    const vault = { "Ostrel Group": "Karl Studio" };
    const r = await pseudonymize(NOTION, {
      vault,
      kinds: { "Karl Studio": "company" },
      disabledKinds: ["url"],
    });
    expect(r.text).toContain("Ostrel Group");
    expect(r.text).toContain("https://app.notion.com/p/2b7c9f?pvs=1");
  });

  // Le postcondition (« signalé ⇒ coffré ⇒ substitué ») ne vérifie pas la DISPARITION du
  // texte, donc la garde ne doit jamais laisser une valeur ENTIÈREMENT en clair tout en la
  // comptant comme redacted. Elle ne le peut pas : la garde partage les spans du filtre,
  // et tout candidat qui a survécu au filtre a une occurrence HORS URL — celle-là est bien
  // substituée. Épinglé ici parce que rien d'autre ne relie les deux.
  it("never CLAIMS a redaction the guard left wholly in clear", async () => {
    const t = `Karl Studio a livré : https://app.notion.com/p/x-karl-studio-1`;
    const r = await pseudonymize(t, {
      vault: { "Ostrel Group": "Karl Studio" },
      kinds: { "Karl Studio": "company" },
      disabledKinds: ["url"],
    });
    for (const m of r.matches) expect(r.text).not.toContain(m.value);
    expect(r.text.startsWith("Ostrel Group")).toBe(true);
  });

  it("`structuralUrlHosts` spares a connector's URL sub-parts even with the url category ON", async () => {
    const t = `{"url":"https://app.notion.com/p/36db8e7d426681e79f43d3395ddc1f87?pvs=1"}`;
    const off = await pseudonymize(t, { vault: {} });
    // url category ON (Strict) ⇒ the whole address is faked today.
    expect(off.text).not.toContain("app.notion.com");
    const on = await pseudonymize(t, { vault: {}, structuralUrlHosts: ["notion.com"] });
    expect(on.text).toContain("https://app.notion.com/p/");
  });
});
