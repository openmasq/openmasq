import { describe, expect, it } from "vitest";
import type { Vault } from "@openmasq/redact";
import {
  looksLikeSecret,
  mergeExtraction,
  parseExtraction,
  resolveExtraction,
  worthExtracting,
} from "./extract";
import { runMemoryExtraction } from "../state/useMemoryExtraction";
import type { Conversation, MemoryData } from "../types";

// The conversation's vault: fake → real (what the wire replay uses).
const VAULT: Vault = { "Norvik Group": "Karl Studio", "Simon Cros": "Augustin Vaudel" };

describe("worthExtracting — the zero-cost gate", () => {
  it("skips small chatter with no entity (no model call)", () => {
    expect(worthExtracting({ userTexts: ["quelle heure est-il ?"], kinds: {} })).toBe(false);
  });
  it("an explicit phrasing bypasses the char floor", () => {
    expect(worthExtracting({ userTexts: ["retiens que je préfère le train"], kinds: {} })).toBe(true);
  });
  it("enough text + a detected entity (the NER already ran — free signal) passes", () => {
    expect(
      worthExtracting({
        userTexts: ["x".repeat(500)],
        kinds: { "Karl Studio": "company" },
      }),
    ).toBe(true);
  });
  it("enough text but zero entity still skips", () => {
    expect(worthExtracting({ userTexts: ["x".repeat(500)], kinds: {} })).toBe(false);
  });
});

describe("parseExtraction — strict, clamped, never throws", () => {
  it("parses a fenced/prosed reply and clamps to MAX facts", () => {
    const reply =
      "Voici :\n```json\n" +
      JSON.stringify({
        profil: null,
        faits: Array.from({ length: 12 }, (_, i) => ({ entite: `E${i}`, cat: "projet", fait: `f${i}` })),
      }) +
      "\n```";
    const out = parseExtraction(reply);
    expect(out!.facts).toHaveLength(6);
    expect(out!.profile).toBeUndefined();
  });
  it("AUCUN objet JSON ⇒ null — illisible, à distinguer d'une extraction vide", () => {
    for (const r of ["rien à signaler", "{oops", "<think>je réfléchis {encore}</think>"]) {
      expect(parseExtraction(r)).toBeNull();
    }
  });
  it("JSON valide mais hors contrat ⇒ extraction VIDE (le modèle a répondu, rien d'utilisable)", () => {
    for (const r of ['{"faits": "non"}', '{"faits": [{"entite": 3}]}']) {
      expect(parseExtraction(r)!.facts).toEqual([]);
    }
  });

  it("une entité FRAGMENT DE PHRASE est refusée — le bug « Brightpath capitalshojojkxm »", () => {
    // Log entry from 02/08: « Les deux fichiers sont des… » filed as an organization → its
    // forced redaction then turned it into gibberish on every injection. An entity name is
    // a short noun phrase; a non-nominal alias is simply dropped.
    const reply = JSON.stringify({
      faits: [
        { entite: "Les deux fichiers sont des bilans prévisionnels", cat: "organisation", fait: "x" },
        { entite: "Le client a signé le devis…", cat: "autre", fait: "x" },
        { entite: "Karl Studio", cat: "organisation", fait: "ok", alias: "elle est basée à Paris" },
        { entite: "Plan A", cat: "projet", fait: "gardé" }, // capitalized « A » ≠ the verb avoir
        { entite: "Grand Est", cat: "autre", fait: "gardé" }, // capitalized « Est » ≠ être
      ],
    });
    const out = parseExtraction(reply)!;
    expect(out.facts.map((f) => f.entity)).toEqual(["Karl Studio", "Plan A", "Grand Est"]);
    expect(out.facts[0].alias).toBeUndefined(); // l'alias-phrase est tombé, la fiche reste
  });
  it("survit à la prose accolée d'un modèle « thinking » : dernier objet CONFORME retenu", () => {
    const reply =
      'Analysons. Un résultat vide serait {"exemple": true} mais ici on retient :\n' +
      '{"profil":null,"faits":[{"entite":"Karl Studio","cat":"organisation","fait":"Client principal."}]}\nVoilà.';
    const out = parseExtraction(reply);
    expect(out!.facts.map((f) => f.entity)).toEqual(["Karl Studio"]);
  });
  it("les balises <think> sont retirées avant le scan (leurs brouillons JSON ignorés)", () => {
    const reply =
      '<think>brouillon : {"faits":[{"entite":"Fantôme","cat":"autre","fait":"x"}]}</think>{"profil":null,"faits":[]}';
    expect(parseExtraction(reply)!.facts).toEqual([]);
  });
  it("une accolade DANS une chaîne JSON ne casse pas l'équilibrage", () => {
    const out = parseExtraction('{"profil":null,"faits":[{"entite":"Zeta","cat":"projet","fait":"Contient } et { sans casser."}]}');
    expect(out!.facts[0].fact).toBe("Contient } et { sans casser.");
  });
  it("an unknown cat degrades to « autre »", () => {
    const out = parseExtraction('{"profil":null,"faits":[{"entite":"X","cat":"zèbre","fait":"y"}]}');
    expect(out!.facts[0].cat).toBe("autre");
  });
  it("reads an alias; a null or entity-equal alias is dropped", () => {
    const out = parseExtraction(
      '{"profil":null,"faits":[' +
        '{"entite":"Manon Verdolini","alias":"Manon","cat":"personne","fait":"a"},' +
        '{"entite":"Karl Studio","alias":null,"cat":"organisation","fait":"b"},' +
        '{"entite":"Zeta","alias":"ZETA","cat":"projet","fait":"c"}]}',
    );
    expect(out!.facts.map((f) => f.alias)).toEqual(["Manon", undefined, undefined]);
  });
});

describe("resolveExtraction — un-redact + the two drop filters", () => {
  const source = "Le devis de Karl Studio est signé. Augustin Vaudel préfère les points le jeudi.";

  it("un-redacts entity AND fact through the vault (the extractor only saw fakes)", () => {
    const out = resolveExtraction(
      { facts: [{ entity: "Norvik Group", cat: "organisation", fact: "Devis signé avec Norvik Group." }] },
      VAULT,
      source,
    );
    expect(out.facts).toEqual([
      { entity: "Karl Studio", cat: "organisation", fact: "Devis signé avec Karl Studio." },
    ]);
  });

  it("DROPS a hallucinated entity (resolves to nothing present in the real text)", () => {
    const out = resolveExtraction(
      { facts: [{ entity: "Vertex Corp", cat: "organisation", fact: "Concurrent principal." }] },
      VAULT,
      source,
    );
    expect(out.facts).toEqual([]);
  });

  it("DROPS a fact carrying a secret shape (memory stores facts, never credentials)", () => {
    const out = resolveExtraction(
      {
        facts: [
          { entity: "Simon Cros", cat: "personne", fact: "Son IBAN est FR76 3000 6000 0112 3456 7890 189." },
        ],
      },
      VAULT,
      source,
    );
    expect(out.facts).toEqual([]);
  });

  it("an ALIAS rides along when anchored, un-redacted like the rest", () => {
    const src = "Le devis de Karl Studio est signé. Augustin Vaudel (« Vaudel » pour tout le monde) valide jeudi.";
    const out = resolveExtraction(
      { facts: [{ entity: "Simon Cros", alias: "Vaudel", cat: "personne", fact: "Valide le jeudi." }] },
      VAULT,
      src,
    );
    expect(out.facts).toEqual([{ entity: "Augustin Vaudel", alias: "Vaudel", cat: "personne", fact: "Valide le jeudi." }]);
  });

  it("an INVENTED alias is dropped ALONE — the anchored fact survives", () => {
    const out = resolveExtraction(
      { facts: [{ entity: "Simon Cros", alias: "Simo", cat: "personne", fact: "Préfère le jeudi." }] },
      VAULT,
      source,
    );
    expect(out.facts).toHaveLength(1);
    expect(out.facts[0].alias).toBeUndefined();
    expect(out.facts[0].entity).toBe("Augustin Vaudel");
  });

  it("a GENERIC alias is dropped (« direction » must never become a matchable surface)", () => {
    const src = "Le devis de Karl Studio est signé. Voir avec la direction de Karl Studio.";
    const out = resolveExtraction(
      { facts: [{ entity: "Norvik Group", alias: "direction", cat: "organisation", fact: "Devis signé." }] },
      VAULT,
      src,
    );
    expect(out.facts).toHaveLength(1);
    expect(out.facts[0].alias).toBeUndefined();
  });

  it("a GENERIC entity is dropped in SILENT mode, kept as a NOTE on an explicit ask", () => {
    const src = "L'équipe préfère les points le jeudi, retiens ça.";
    const parsed = { facts: [{ entity: "équipe", cat: "autre" as const, fact: "Points le jeudi." }] };
    expect(resolveExtraction(parsed, {}, src).facts).toEqual([]);
    const explicit = resolveExtraction(parsed, {}, src, { allowNotes: true });
    expect(explicit.facts).toHaveLength(1); // the user asked — their consent, their word
  });

  it("a CJK entity anchors (2 glyphs = a full name, unsegmented text)", () => {
    const out = resolveExtraction(
      { facts: [{ entity: "张伟", cat: "personne", fact: "Contact à Shanghai." }] },
      {},
      "请尽快联系张伟先生。",
    );
    expect(out.facts).toHaveLength(1);
  });

  it("looksLikeSecret catches keys/cards/IBAN/long tokens, spares prose", () => {
    expect(looksLikeSecret("clé sk-abc123def456ghi789")).toBe(true);
    expect(looksLikeSecret("4242424242424242")).toBe(true);
    expect(looksLikeSecret("préfère les points le jeudi matin")).toBe(false);
  });
});

describe("mergeExtraction — compaction, dedup, provenance", () => {
  const base: MemoryData = {
    cards: [
      { id: "c1", entity: "Karl Studio", cat: "organisation", facts: "Agence de design à Évreux.", createdAt: 1, updatedAt: 1 },
    ],
  };

  it("a KNOWN entity gains the new fact (appended, recency-touched) — no duplicate card, nothing created", () => {
    const out = mergeExtraction(
      base,
      { facts: [{ entity: "karl-studio", cat: "organisation", fact: "Devis Q3 signé." }] },
      99,
    );
    expect(out.data.cards).toHaveLength(1);
    expect(out.data.cards[0].facts).toContain("Agence de design");
    expect(out.data.cards[0].facts).toContain("Devis Q3 signé");
    expect(out.data.cards[0].updatedAt).toBe(99);
    expect(out.createdIds).toEqual([]); // merged into an existing card — not a creation
  });

  it("an already-known fact is a no-op (containment dedup)", () => {
    const out = mergeExtraction(base, { facts: [{ entity: "Karl Studio", cat: "organisation", fact: "agence de design à Évreux" }] }, 99);
    expect(out.data.cards[0].updatedAt).toBe(1);
  });

  it("a NEW entity becomes a card tagged source:auto, keeping its PRE-minted id in createdIds", () => {
    const out = mergeExtraction(base, { facts: [{ entity: "Projet Zeta", cat: "projet", fact: "Kickoff en août.", id: "pre-1" }] });
    expect(out.data.cards[0]).toMatchObject({ id: "pre-1", entity: "Projet Zeta", source: "auto" });
    expect(out.createdIds).toEqual(["pre-1"]);
    // Deterministic with pre-minted ids: computing the merge twice creates the SAME ids.
    const again = mergeExtraction(base, { facts: [{ entity: "Projet Zeta", cat: "projet", fact: "Kickoff en août.", id: "pre-1" }] });
    expect(again.createdIds).toEqual(out.createdIds);
  });

  it("an alias lands on the card — new card at creation, known card by append, bounded + deduped", () => {
    const created = mergeExtraction(base, {
      facts: [{ entity: "Manon Verdolini", alias: "Manon", cat: "personne", fact: "Cliente." }],
    });
    expect(created.data.cards[0].aliases).toEqual(["Manon"]);
    // The alias becomes a matchable SURFACE: the same entity re-extracted under the
    // alias merges into the card instead of forking a second one.
    const merged = mergeExtraction(created.data, {
      facts: [{ entity: "Manon", alias: "Manon Verdolini", cat: "personne", fact: "Dossier fiscal en cours." }],
    });
    expect(merged.data.cards).toHaveLength(2); // base card + the one Manon card
    const manon = merged.data.cards.find((c) => c.entity === "Manon Verdolini")!;
    expect(manon.facts).toContain("Dossier fiscal");
    expect(manon.aliases).toEqual(["Manon"]); // "Manon Verdolini" = the entity, not a new alias
  });

  it("the profile appends only NEW information and never overwrites", () => {
    const withProfile: MemoryData = { profile: "Consultant indépendant.", cards: [] };
    const out = mergeExtraction(withProfile, { facts: [], profile: "Répond en français." });
    expect(out.data.profile).toBe("Consultant indépendant. Répond en français.");
    const noop = mergeExtraction(withProfile, { facts: [], profile: "consultant indépendant" });
    expect(noop.data.profile).toBe("Consultant indépendant.");
  });

  it("reports whether the profile gained new text (drives the chat feedback)", () => {
    const withProfile: MemoryData = { profile: "Consultant indépendant.", cards: [] };
    expect(mergeExtraction(withProfile, { facts: [], profile: "Répond en français." }).profileChanged).toBe(true);
    expect(mergeExtraction(withProfile, { facts: [], profile: "consultant indépendant" }).profileChanged).toBe(false);
    expect(mergeExtraction(withProfile, { facts: [] }).profileChanged).toBe(false);
    // A fresh preference on an EMPTY profile also counts as changed.
    expect(mergeExtraction({ cards: [] }, { facts: [], profile: "Réponses courtes, en français." }).profileChanged).toBe(true);
  });
});

describe("runMemoryExtraction — the whole pass, scripted model", () => {
  const conv = (over: Partial<Conversation> = {}): Conversation => ({
    id: "k1",
    title: "t",
    modelId: "qwen2.5",
    createdAt: 0,
    updatedAt: 0,
    redactionVault: VAULT,
    messages: [
      { id: "u1", role: "user", content: "Retiens que Karl Studio a signé le devis Q3.", redactedSpans: [{ value: "Karl Studio", kind: "company" }] },
      { id: "a1", role: "assistant", content: "Noté." },
    ],
    ...over,
  });

  function deps(complete: (p: { messages: { role: string; content: string }[] }) => Promise<string>) {
    let memoryData: MemoryData = { cards: [] };
    const patches: number[] = [];
    return {
      settings: { memoryAuto: true } as Parameters<typeof runMemoryExtraction>[1]["settings"],
      complete: complete as Parameters<typeof runMemoryExtraction>[1]["complete"],
      setMemory: (fn: (m: MemoryData) => MemoryData) => (memoryData = fn(memoryData)),
      patchConversation: (_id: string, fn: (c: Conversation) => Conversation) =>
        patches.push(fn(conv()).memoryWatermark ?? -1),
      get memoire() { return memoryData; },
      get watermarks() { return patches; },
    };
  }

  it("the extractor reads the WIRE (fakes), the store receives the REAL value", async () => {
    let sawUser = "";
    const d = deps(async (p) => {
      sawUser = p.messages[p.messages.length - 1]?.content ?? "";
      // The model answers with the FAKE it read — like a real model would.
      return JSON.stringify({ profil: null, faits: [{ entite: "Norvik Group", cat: "organisation", fait: "Devis Q3 signé avec Norvik Group." }] });
    });
    const n = await runMemoryExtraction(conv(), d);
    expect(sawUser).toContain("Norvik Group"); // wire form: the fake, never the real
    expect(sawUser).not.toContain("Karl Studio");
    expect(n).toBe(1);
    expect(d.memoire.cards[0]).toMatchObject({ entity: "Karl Studio", source: "auto" });
    expect(d.memoire.cards[0].facts).toContain("Karl Studio"); // stored REAL
    expect(d.watermarks).toEqual([2]); // cursor advanced past both messages
  });

  it("opt-out / pending turn / nothing new ⇒ no call, no change", async () => {
    let calls = 0;
    const d = deps(async () => (calls++, '{"profil":null,"faits":[]}'));
    await runMemoryExtraction(conv(), { ...d, settings: { memoryAuto: false } as never });
    await runMemoryExtraction(conv({ messages: [{ id: "u1", role: "user", content: "x", pending: true } as never] }), d);
    await runMemoryExtraction(conv({ memoryWatermark: 2 }), d);
    expect(calls).toBe(0);
  });

  it("a model failure leaves the watermark, so a later trigger retries", async () => {
    const d = deps(async () => {
      throw new Error("offline");
    });
    const n = await runMemoryExtraction(conv(), d);
    expect(n).toBe(0);
    expect(d.watermarks).toEqual([]); // NOT advanced — the slice stays extractable
  });
});

describe("« retiens ça » — the explicit fast path", () => {
  it("isExplicitMemoryAsk matches the phrasings, not ordinary prose", async () => {
    const { isExplicitMemoryAsk } = await import("./extract");
    for (const s of ["Retiens ça", "souviens-toi que je pars tôt", "note bien : jamais le lundi"]) {
      expect(isExplicitMemoryAsk(s), s).toBe(true);
    }
    expect(isExplicitMemoryAsk("quelle heure est-il ?")).toBe(false);
  });

  // The reported case: « note les en mémoire » triggered nothing, and « mémorise ça » — the
  // most literal way to ask for it — didn't either. The list only knew
  // « retiens » and « note QUE / note BIEN », i.e. the phrasing that introduces a fact,
  // never the one that refers to what was just said. A user who asks twice
  // and gets nothing concludes memory doesn't work.
  it("attrape les formulations DIRECTES, pas seulement « retiens » / « note que »", async () => {
    const { isExplicitMemoryAsk } = await import("./extract");
    for (const s of [
      "note les en mémoire",
      "note-les en mémoire",
      "mémorise ça",
      "mémorise",
      "garde ça en mémoire",
      "garde en mémoire",
      "enregistre ça",
      "ajoute ça à ta mémoire",
      "memorize this",
      "save this",
      "note this down",
      "guarda esto",
      "speichere das",
      "memorizza questo",
    ]) {
      expect(isExplicitMemoryAsk(s), s).toBe(true);
    }
  });

  it("laisse passer la prose ordinaire qui parle de fichiers ou de rythme", async () => {
    const { isExplicitMemoryAsk } = await import("./extract");
    for (const s of [
      "quels sont les concurrents ?",
      "enregistre le fichier sur le disque", // « enregistre » with no demonstrative object
      "garde le rythme",
      "la mémoire vive de mon PC",
    ]) {
      expect(isExplicitMemoryAsk(s), s).toBe(false);
    }
  });

  it("matches the ENGLISH phrasings too — an English ask must not silently retain nothing", async () => {
    const { isExplicitMemoryAsk } = await import("./extract");
    for (const s of [
      "Remember that I work Tuesdays from home",
      "keep in mind I never ship on Fridays",
      "don't forget: invoices go out on the 1st",
      "don’t forget my timezone is CET", // curly apostrophe
      "note that the client prefers short emails",
      "from now on, answer in French",
      "I prefer bullet points",
    ]) {
      expect(isExplicitMemoryAsk(s), s).toBe(true);
    }
    expect(isExplicitMemoryAsk("what time is it?")).toBe(false);
  });

  it("matches an explicit ask in EVERY supported language (incl. non-Latin scripts)", async () => {
    const { isExplicitMemoryAsk } = await import("./extract");
    for (const s of [
      "Recuerda que trabajo desde casa los martes", // es
      "no olvides que facturo el día 1", // es
      "Merk dir, dass ich dienstags im Homeoffice bin", // de
      "vergiss nicht: Rechnungen gehen am 1. raus", // de
      "Ricordati che preferisco risposte brevi", // it
      "d'ora in poi rispondi in italiano", // it
      "Lembre-se que trabalho de casa às terças", // pt
      "não esqueça o fuso horário", // pt
      "Onthoud dat ik op dinsdag thuiswerk", // nl
      "Запомни: я работаю из дома по вторникам", // ru (Cyrillic — \b can't bound this)
      "не забудь про часовой пояс", // ru
      "تذكر أنني أعمل من المنزل يوم الثلاثاء", // ar
      "记住我周二在家办公", // zh — NO word boundaries exist in the script
      "別忘了發票一號寄出", // zh-Hant
      "覚えておいて、火曜は在宅です", // ja
      "기억해 화요일은 재택이야", // ko
    ]) {
      expect(isExplicitMemoryAsk(s), s).toBe(true);
    }
    // Ordinary prose in those scripts stays quiet.
    expect(isExplicitMemoryAsk("¿qué hora es?")).toBe(false);
    expect(isExplicitMemoryAsk("который час?")).toBe(false);
    expect(isExplicitMemoryAsk("今天天气怎么样")).toBe(false);
  });

  it("an explicit ask re-reads BELOW the watermark — the referent of « ça » is recovered", async () => {
    // The long content sits in a message ALREADY consumed (watermark=2); the ask arrives alone.
    const conv: Conversation = {
      id: "k1", title: "t", modelId: "qwen2.5", createdAt: 0, updatedAt: 0,
      redactionVault: VAULT, memoryWatermark: 2,
      messages: [
        { id: "u0", role: "user", content: "Le devis de Karl Studio est signé, deadline septembre." },
        { id: "a0", role: "assistant", content: "Noté." },
        { id: "u1", role: "user", content: "Retiens ça." },
        { id: "a1", role: "assistant", content: "C'est retenu." },
      ],
    };
    let sawUser = "";
    let memoryData: MemoryData = { cards: [] };
    let noted: number | undefined;
    const n = await runMemoryExtraction(conv, {
      settings: { memoryAuto: true } as never,
      complete: (async (p: { messages: { content: string }[] }) => {
        sawUser = p.messages[p.messages.length - 1]?.content ?? "";
        return JSON.stringify({ profil: null, faits: [{ entite: "Norvik Group", cat: "organisation", fait: "Devis signé, deadline septembre." }] });
      }) as never,
      setMemory: (fn) => (memoryData = fn(memoryData)),
      patchConversation: () => {},
      noteOnMessage: (_id, c) => (noted = c),
    }, { explicit: true });
    expect(sawUser).toContain("Norvik Group"); // the lookback recovered the referent (wire form)
    expect(n).toBe(1);
    expect(memoryData.cards[0].entity).toBe("Karl Studio");
    expect(noted).toBe(1); // the visible feedback fired
  });

  it("a note card is allowed ONLY in explicit mode (bounded loosening of the anchor filter)", () => {
    const parsed = { facts: [{ entity: "Méthode de relance", cat: "autre" as const, fact: "Toujours relancer sous 48h, jamais le lundi." }] };
    const source = "retiens ça : toujours relancer sous 48h, jamais le lundi";
    // Silent mode: unanchored entity → dropped (anti-hallucination holds).
    expect(resolveExtraction(parsed, {}, source).facts).toEqual([]);
    // Explicit mode: kept as a note (flagged `note` so the merge dedups it on its
    // FACT — the invented title changes every run), cat forced « autre », secrets
    // still screened.
    const notes = resolveExtraction(parsed, {}, source, { allowNotes: true });
    expect(notes.facts).toEqual([{ ...parsed.facts[0], note: true }]);
    const secret = { facts: [{ entity: "Accès serveur", cat: "autre" as const, fact: "clé sk-abc123def456ghi789" }] };
    expect(resolveExtraction(secret, {}, source, { allowNotes: true }).facts).toEqual([]);
  });

  it("an explicit ask over a TRASH conversation feeds back « 0 » — an answer, not silence", async () => {
    let noted: number | undefined;
    const n = await runMemoryExtraction(
      {
        id: "k1", title: "t", modelId: "qwen2.5", createdAt: 0, updatedAt: 0, redactionVault: {},
        messages: [
          { id: "u1", role: "user", content: "Affiche l'évolution des 5 ETF PEA les plus performants." },
          { id: "a1", role: "assistant", content: "Voici le graphe." },
          { id: "u2", role: "user", content: "Retiens ça." },
          { id: "a2", role: "assistant", content: "…" },
        ],
      },
      {
        settings: { memoryAuto: true } as never,
        // A good model judges a one-off chart request non-durable: empty extraction.
        complete: (async () => '{"profil": null, "faits": []}') as never,
        setMemory: () => { throw new Error("nothing must be stored"); },
        patchConversation: () => {},
        noteOnMessage: (_id, c) => (noted = c),
      },
      { explicit: true },
    );
    expect(n).toBe(0);
    expect(noted).toBe(0); // the visible « rien de durable à retenir »
  });

  it("an explicit ask runs even with memoryAuto OFF — the ask is its own consent", async () => {
    let memoryData: MemoryData = { cards: [] };
    let noted: { count: number; ids?: string[] } | undefined;
    const n = await runMemoryExtraction(
      {
        id: "k1", title: "t", modelId: "qwen2.5", createdAt: 0, updatedAt: 0, redactionVault: VAULT,
        messages: [
          { id: "u1", role: "user", content: "Retiens que Karl Studio a signé le devis Q3." },
          { id: "a1", role: "assistant", content: "Noté." },
        ],
      },
      {
        settings: { memoryAuto: false } as never,
        complete: (async () =>
          JSON.stringify({ profil: null, faits: [{ entite: "Norvik Group", cat: "organisation", fait: "Devis Q3 signé." }] })) as never,
        setMemory: (fn) => (memoryData = fn(memoryData)),
        patchConversation: () => {},
        noteOnMessage: (_id, count, ids) => (noted = { count, ids }),
      },
      { explicit: true },
    );
    expect(n).toBe(1);
    expect(memoryData.cards[0].entity).toBe("Karl Studio");
    // The feedback carries the CREATED card's id — and it matches the stored card,
    // so the caption's deep-link and « Annuler » target the right card.
    expect(noted?.ids).toEqual([memoryData.cards[0].id]);
  });

  it("a PROFILE-only preference is saved AND fed back (« je préfère… » has no entity)", async () => {
    // The user's exact case: a response-style preference. The extractor puts it in the
    // profile (no proper noun → no card), so facts.length is 0 — but it IS a save, and
    // the feedback must carry the « profile » sentinel or the caption reads « rien retenu ».
    let memoryData: MemoryData = { cards: [] };
    let noted: { count: number; ids?: string[] } | undefined;
    const n = await runMemoryExtraction(
      {
        id: "k1", title: "t", modelId: "qwen2.5", createdAt: 0, updatedAt: 0, redactionVault: {},
        messages: [
          { id: "u1", role: "user", content: "Retiens que je préfère des réponses courtes, en français." },
          { id: "a1", role: "assistant", content: "Compris 👍" },
        ],
      },
      {
        settings: { memoryAuto: false } as never,
        complete: (async () =>
          JSON.stringify({ profil: "Préfère des réponses courtes, en français.", faits: [] })) as never,
        setMemory: (fn) => (memoryData = fn(memoryData)),
        patchConversation: () => {},
        noteOnMessage: (_id, count, ids) => (noted = { count, ids }),
      },
      { explicit: true },
    );
    expect(n).toBe(0); // no FACTS…
    expect(memoryData.profile).toBe("Préfère des réponses courtes, en français."); // …but the profile WAS saved
    expect(noted?.count).toBe(0);
    expect(noted?.ids).toEqual(["profile"]); // the sentinel → caption says « Préférence enregistrée »
  });

  it("silent runs never call noteOnMessage (feedback is for explicit asks only)", async () => {
    let noted = false;
    await runMemoryExtraction(
      {
        id: "k1", title: "t", modelId: "qwen2.5", createdAt: 0, updatedAt: 0, redactionVault: VAULT,
        messages: [
          { id: "u1", role: "user", content: "Le devis de Karl Studio est signé.", redactedSpans: [{ value: "Karl Studio", kind: "company" }] },
          { id: "a1", role: "assistant", content: "Ok." },
        ],
      },
      {
        settings: { memoryAuto: true } as never,
        complete: (async () =>
          JSON.stringify({ profil: null, faits: [{ entite: "Norvik Group", cat: "organisation", fait: "Devis signé." }] })) as never,
        setMemory: () => {},
        patchConversation: () => {},
        noteOnMessage: () => (noted = true),
      },
    );
    expect(noted).toBe(false);
  });
});

describe("préférences — jamais une carte-note à titre inventé (la régression des doublons)", () => {
  /* The report: dozens of cards « Préférence de réponse » / « Préférence
     utilisateur », all carrying « Préfère des réponses courtes en français ».
     The chain: « je préfère » triggers explicit mode → the invented entity doesn't
     anchor → note-card, and the title changes on EVERY run, so the entity-key
     merge recreates a card on every extraction. Two locks, pinned here. */

  it("une note auto-préférence est routée vers le PROFIL, pas vers une carte", () => {
    const parsed = {
      facts: [
        {
          entity: "Préférence de réponse",
          cat: "autre" as const,
          fact: "Préfère des réponses courtes en français.",
        },
      ],
    };
    const source = "retiens que je préfère des réponses courtes en français";
    const r = resolveExtraction(parsed, {}, source, { allowNotes: true });
    expect(r.facts).toEqual([]); // no card — whatever title the model invented
    expect(r.profile).toBe("Préfère des réponses courtes en français.");
  });

  it("une note NON-préférence dedupe sur son FAIT : deux titres inventés ⇒ UNE carte", () => {
    const source = "retiens ça : toujours relancer sous 48h";
    const runOnce = (memory: MemoryData, entity: string) => {
      const r = resolveExtraction(
        { facts: [{ entity, cat: "autre" as const, fact: "Toujours relancer sous 48h." }] },
        {},
        source,
        { allowNotes: true },
      );
      return mergeExtraction(memory, r).data;
    };
    const after1 = runOnce({ cards: [] }, "Méthode de relance");
    expect(after1.cards).toHaveLength(1);
    // Second run, same fact, DIFFERENT invented title — the report's exact shape.
    const after2 = runOnce(after1, "Règle de relance");
    expect(after2.cards).toHaveLength(1);
  });

  it("après une fusion manuelle, la ré-extraction ne ressuscite pas le doublon", () => {
    // The user merged the duplicates by hand: one card whose facts carry the sentence.
    const merged: MemoryData = {
      cards: [
        {
          id: "m1", entity: "Habitudes", cat: "autre", createdAt: 0, updatedAt: 0,
          facts: "Toujours relancer sous 48h. Jamais le lundi.",
        } as never,
      ],
    };
    const r = resolveExtraction(
      { facts: [{ entity: "Rituel de relance", cat: "autre" as const, fact: "Toujours relancer sous 48h." }] },
      {},
      "retiens : toujours relancer sous 48h",
      { allowNotes: true },
    );
    const { data, createdIds } = mergeExtraction(merged, r);
    expect(createdIds).toEqual([]);
    expect(data.cards).toHaveLength(1);
  });

  it("un fait sur un TIERS nommé garde sa carte (l'entité s'ancre, pas une note)", () => {
    const source = "retiens que Marie Kerner préfère le thé";
    const r = resolveExtraction(
      { facts: [{ entity: "Marie Kerner", cat: "personne" as const, fact: "Préfère le thé." }] },
      {},
      source,
      { allowNotes: true },
    );
    expect(r.facts).toHaveLength(1);
    expect(r.facts[0].note).toBeUndefined();
    expect(r.profile).toBeUndefined();
  });
});

describe("mergeExtraction — mise à jour et rattachement (mémoire imbriquée)", () => {
  const base = (): MemoryData => ({
    cards: [
      {
        id: "c1", entity: "Ondine", cat: "projet",
        facts: "Refonte complète du site. La deadline est fin septembre.",
        createdAt: 1, updatedAt: 1,
      },
      { id: "c2", entity: "Atelier Torbel", cat: "organisation", facts: "Client principal.", createdAt: 1, updatedAt: 1 },
    ],
  });

  it("un fait d'ATTRIBUT remplace la phrase concurrente (deadline changée ≠ accumulation)", () => {
    const { data } = mergeExtraction(base(), {
      facts: [{ entity: "Ondine", cat: "projet", fact: "Deadline désormais le 15 novembre." }],
    });
    const ondine = data.cards.find((c) => c.entity === "Ondine")!;
    expect(ondine.facts).toMatch(/novembre/);
    expect(ondine.facts).not.toMatch(/septembre/); // l'ancienne deadline est PARTIE
    expect(ondine.facts).toMatch(/Refonte complète/); // la phrase sans attribut reste
  });

  it("un fait SANS attribut concurrent s'ajoute simplement", () => {
    const { data } = mergeExtraction(base(), {
      facts: [{ entity: "Ondine", cat: "projet", fact: "Maquettes validées par le client." }],
    });
    const ondine = data.cards.find((c) => c.entity === "Ondine")!;
    expect(ondine.facts).toMatch(/septembre/);
    expect(ondine.facts).toMatch(/Maquettes validées/);
  });

  it("« Atelier Torbel SARL » rejoint la carte « Atelier Torbel » (cœur org) — jamais un doublon", () => {
    const { data, createdIds } = mergeExtraction(base(), {
      facts: [{ entity: "Atelier Torbel SARL", cat: "organisation", fact: "Contrat cadre signé en janvier." }],
    });
    expect(createdIds).toEqual([]); // pas de nouvelle carte
    const sud = data.cards.filter((c) => c.entity.toLowerCase().includes("atelier torbel"));
    expect(sud).toHaveLength(1);
    expect(sud[0].facts).toMatch(/Contrat cadre/);
    expect(sud[0].aliases).toContain("Atelier Torbel SARL"); // la surface nouvelle est un alias
  });

  it("deux HOMONYMES de prénom restent deux cartes distinctes", () => {
    const mem: MemoryData = {
      cards: [
        { id: "a", entity: "Claire Fontaine", cat: "personne", facts: "Contact client.", createdAt: 1, updatedAt: 1 },
      ],
    };
    const { data, createdIds } = mergeExtraction(mem, {
      facts: [{ entity: "Claire Vernaux", cat: "personne", fact: "Directrice technique." }],
    });
    expect(createdIds).toHaveLength(1); // une NOUVELLE carte, pas une fusion sur « Claire »
    expect(data.cards).toHaveLength(2);
  });
});

describe("resolveExtraction — élision/article recopiés par l'extracteur", () => {
  it("« d'Atelier Torbel » redevient « Atelier Torbel » (pas de carte doublon)", () => {
    const real = "Claire Fontaine d'Atelier Torbel paie en retard.";
    const r = resolveExtraction(
      { facts: [{ entity: "d'Atelier Torbel", cat: "organisation", fact: "Paie en retard." }] },
      {},
      real,
    );
    expect(r.facts[0]?.entity).toBe("Atelier Torbel");
  });
  it("« chez Karl Studio » → « Karl Studio »", () => {
    const real = "Je travaille chez Karl Studio depuis trois ans.";
    const r = resolveExtraction(
      { facts: [{ entity: "chez Karl Studio", cat: "organisation", fact: "Employeur." }] },
      {},
      real,
    );
    expect(r.facts[0]?.entity).toBe("Karl Studio");
  });
  it("une PARTICULE de nom de personne n'est jamais rognée (« de Vinci » reste entier)", () => {
    const r = resolveExtraction(
      { facts: [{ entity: "de Vinci", cat: "personne", fact: "Peintre." }] },
      {},
      "l'atelier de Vinci est célèbre.",
    );
    expect(r.facts[0]?.entity).toBe("de Vinci");
  });
});

describe("resolveExtraction — gardes anti-confusion (éval mémoire imbriquée)", () => {
  it("une entité-PHRASE (verbe de clause) est jetée même ancrée verbatim", () => {
    const real = "Le projet en cours pour Atelier Torbel s'appelle Ondine.";
    const r = resolveExtraction(
      { facts: [{ entity: "Atelier Torbel s'appelle Ondine", cat: "projet", fact: "Refonte." }] },
      {},
      real,
    );
    expect(r.facts).toEqual([]);
  });
  it("un alias MONO-MOT homographe (« Claire ») est refusé — il ferait déborder le rappel", () => {
    const real = "Claire Fontaine, dite Claire, est notre contact.";
    const r = resolveExtraction(
      { facts: [{ entity: "Claire Fontaine", alias: "Claire", cat: "personne", fact: "Contact." }] },
      {},
      real,
    );
    expect(r.facts[0]?.alias).toBeUndefined();
    expect(r.facts[0]?.entity).toBe("Claire Fontaine");
  });
});
