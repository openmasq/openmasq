import { calls, says, type MockRequest } from "./mockModel";
import type { MemoryLifeScenario } from "./memoryLife";
import { assertNotOnWire, hasBlock, mustCard } from "./memoryScenarios";

// NESTED MEMORY — a network of entities STRONGLY linked and deliberately
// confounding: two Claires, two Grimonet brothers, a project AND a company that are
// homonyms (« Ondine »), an accountant whose whole name is made of everyday words
// (« Pierre Marché »). Each phase measures that recall stays ACCURATE (the right
// homonym), HONEST (real ambiguity exposes both cards), and that the memory
// UPDATES ITSELF (contradiction → replacement, « SARL » → same card).

const NER = {
  "Karl Studio": "company",
  "Atelier Torbel": "company",
  "Ondine SARL": "company",
  "Claire Fontaine": "name",
  "Claire Vernaux": "name",
  "Baptiste Grimonet": "name",
  "Marc Grimonet": "name",
  "Pierre Marché": "name",
};

export const MEMORY_TANGLE: MemoryLifeScenario = {
  name: "memoire-imbriquee",
  phases: [
    // 1a ─ SEED (people): the confounding human pairs. The product's
    //     MAX_EXTRACTED_FACTS cap (6) forces seeding a dense network over SEVERAL
    //     conversations — that's also how memory grows for real.
    {
      name: "seed-personnes",
      prompts: [
        "Contexte de mon écosystème, première partie — les gens. Chez Karl Studio, la directrice technique est Claire Vernaux — à ne surtout pas confondre avec Claire Fontaine, qui est notre contact CLIENTE chez Atelier Torbel et paie ses factures en retard depuis des mois. Côté prestataires, on travaille avec les deux frères Grimonet : Baptiste Grimonet est notre imprimeur et gère tous les tirages papier, tandis que Marc Grimonet, son frère, est notre avocat d'affaires pour les contrats et les contentieux.",
      ],
      ner: NER,
      mock: [says("Compris — deux Claires bien distinctes et les deux frères Grimonet, c'est noté.")],
      extractor: ({ fake }) =>
        JSON.stringify({
          profil: null,
          faits: [
            { entite: fake("Claire Vernaux"), alias: null, cat: "personne", fait: "Directrice technique chez l'agence de l'utilisateur." },
            { entite: fake("Claire Fontaine"), alias: null, cat: "personne", fait: "Contact cliente, paie ses factures en retard." },
            { entite: fake("Baptiste Grimonet"), alias: null, cat: "personne", fait: "Imprimeur, gère les tirages papier." },
            { entite: fake("Marc Grimonet"), alias: null, cat: "personne", fait: "Avocat d'affaires, frère de l'imprimeur." },
            { entite: fake("Atelier Torbel"), alias: null, cat: "organisation", fait: "Client principal — règle ses factures en retard." },
          ],
        }),
      expect: (ctx) => {
        const claires = ctx.memory.cards.filter((c) => c.entity.toLowerCase().startsWith("claire"));
        if (claires.length !== 2) throw new Error(`les deux Claires devaient rester DEUX cartes — ${claires.length}`);
      },
    },

    // 1b ─ SEED (entities): the project/company homonyms + the homograph accountant.
    {
      name: "seed-entites",
      prompts: [
        "Deuxième partie du contexte — les entités. Le projet en cours pour Atelier Torbel s'appelle Ondine : une refonte complète de leur site, avec une deadline fin septembre qu'on essaie de tenir. Et pour couronner le tout, on a AUSSI un client qui s'appelle Ondine SARL — une société d'hébergement web, aucun rapport avec le projet homonyme, c'est juste une coïncidence pénible. Enfin, notre comptable s'appelle Pierre Marché — oui, comme un marché en pierre, il a l'habitude des blagues.",
      ],
      ner: NER,
      mock: [says("Noté : le projet Ondine, la société homonyme Ondine SARL, et votre comptable.")],
      extractor: ({ fake }) =>
        JSON.stringify({
          profil: null,
          faits: [
            { entite: "Ondine", alias: null, cat: "projet", fait: "Refonte du site du client, deadline fin septembre." },
            { entite: fake("Ondine SARL"), alias: null, cat: "organisation", fait: "Société d'hébergement web cliente — sans rapport avec le projet homonyme." },
            { entite: fake("Pierre Marché"), alias: null, cat: "personne", fait: "Comptable de l'agence." },
          ],
        }),
      expect: (ctx) => {
        for (const e of ["Claire Vernaux", "Claire Fontaine", "Baptiste Grimonet", "Marc Grimonet", "Pierre Marché", "Ondine SARL"]) mustCard(ctx, e);
        const ondines = ctx.memory.cards.filter((c) => c.entity.toLowerCase().includes("ondine"));
        if (ondines.length !== 2) throw new Error(`projet et société Ondine devaient rester DEUX cartes — ${ondines.length}`);
      },
    },

    // 2 ─ PRECISE HOMONYM: the FULL name recalls ONLY the right Claire — the
    //     shared first name ("claire", a denylisted homograph) doesn't spill onto the other.
    {
      name: "homonyme-precis",
      prompts: ["Prépare l'ordre du jour du point technique avec Claire Vernaux pour lundi."],
      ner: NER,
      mock: [says("Ordre du jour du point technique préparé.")],
      expect: (ctx) => {
        if (!hasBlock(ctx)) throw new Error("la carte de Claire Vernaux n'a pas été rappelée");
        if (!/directrice technique/i.test(ctx.wire)) throw new Error("le fait de la BONNE Claire manque");
        // ONLY ONE person card should come through — Vernaux's FACT may legitimately
        // mention the other Claire ("not to be confused with…"): count the
        // injected CARDS, not the words.
        const persons = ctx.wire.match(/^- .+ \(personne\) :/gm) ?? [];
        if (persons.length !== 1) throw new Error(`la MAUVAISE Claire a été injectée aussi (${persons.length} cartes personne)`);
        assertNotOnWire(ctx, "Claire Vernaux");
      },
    },

    // 3 ─ AMBIGUOUS HOMONYM: "les Grimonet" — the ambiguity is REAL, BOTH
    //     cards must come through (silently picking one would be a system error).
    {
      name: "homonyme-ambigu",
      prompts: ["Fais-moi un récapitulatif de ce qu'on sait sur les Grimonet avant ma réunion."],
      ner: {},
      mock: [says("Récap : l'un gère vos impressions, l'autre est votre avocat d'affaires.")],
      expect: (ctx) => {
        if (!/imprim|tirage|papier/i.test(ctx.wire)) throw new Error("la carte de Baptiste (imprimeur) manque");
        if (!/avocat/i.test(ctx.wire)) throw new Error("la carte de Marc (avocat) manque");
        // The FULL names only live in the block (forced) — the bare "Grimonet"
        // the user typed follows the real product behaviour (detection, not forced).
        assertNotOnWire(ctx, "Baptiste Grimonet");
        assertNotOnWire(ctx, "Marc Grimonet");
      },
    },

    // 4 ─ TRAP HOMOGRAPH: a sentence full of everyday words that are ALSO
    //     names ("pierre", "marché", "fontaine", "claire") recalls NOTHING.
    {
      name: "homographe-piege",
      prompts: ["Le marché est en pierre claire, comme la fontaine de la place — belle référence visuelle pour la home page, non ?"],
      ner: {},
      mock: [says("Belle référence — minéral et intemporel, ça peut guider la direction artistique.")],
      expect: (ctx) => {
        if (/^- .+ \((personne|organisation|projet|autre)\) :/m.test(ctx.wire)) {
          throw new Error("des mots courants (pierre/marché/fontaine/claire) ont rappelé des cartes");
        }
        assertNotOnWire(ctx, "Pierre Marché");
      },
    },

    // 5 ─ PROJECT/COMPANY CONFUSION: "Ondine" evokes BOTH homonym cards —
    //     the model gets what it needs to tell them apart, with the facts that separate them.
    {
      name: "confusion-homonymes",
      prompts: ["Où en est Ondine ? Et au fait, prépare la facture annuelle pour la société Ondine SARL."],
      ner: NER,
      mock: [says("Le projet avance vers sa deadline ; la facture d'hébergement annuelle de la société homonyme est prête.")],
      expect: (ctx) => {
        // Robust to a live extractor's phrasing: we require BOTH card categories to be
        // injected (a project line AND an organisation line), not specific words.
        if (!/^- .+ \(projet\) :/m.test(ctx.wire)) throw new Error("la carte PROJET Ondine manque");
        if (!/^- .+ \(organisation\) :/m.test(ctx.wire)) throw new Error("la carte SOCIÉTÉ Ondine SARL manque");
        assertNotOnWire(ctx, "Ondine SARL");
      },
    },

    // 6 ─ CONTRADICTION → UPDATE: the new deadline REPLACES the old one in
    //     the card (the `mergeFacts` lever) — never both side by side.
    {
      name: "update-contradiction",
      prompts: [
        "Correction importante sur le planning, à bien retenir pour la suite : la deadline du projet Ondine n'est plus fin septembre comme convenu initialement — le client a accepté de décaler, c'est désormais le 15 novembre, validé hier par écrit avec Claire Fontaine. Ça nous laisse enfin le temps de faire les choses proprement sur la partie animation, mais ça décale aussi la facturation du solde au mois de décembre, donc préviens-moi si tu me vois planifier quoi que ce soit d'incohérent avec ce nouveau calendrier.",
      ],
      ner: NER,
      mock: [says("Noté : nouvelle deadline au 15 novembre, solde facturé en décembre.")],
      extractor: () =>
        JSON.stringify({
          profil: null,
          faits: [{ entite: "Ondine", alias: null, cat: "projet", fait: "Deadline désormais le 15 novembre (décalage validé par le client)." }],
        }),
      expect: (ctx) => {
        // EXACT selection (entity === "Ondine", cat projet): an inclusion-based helper
        // would also catch the "Ondine SARL" card — the homonymy traps the asserts too.
        const ondine = ctx.memory.cards.find((c) => c.entity === "Ondine" && c.cat === "projet");
        if (!ondine) throw new Error("carte PROJET Ondine introuvable");
        if (!/novembre/i.test(ondine.facts)) throw new Error("la nouvelle deadline n'a pas été retenue");
        if (!ctx.live && /septembre/i.test(ondine.facts)) {
          throw new Error(`l'ANCIENNE deadline cohabite avec la nouvelle — carte : « ${ondine.facts} »`);
        }
      },
    },

    // 7 ─ COMPANY SUFFIX: "Atelier Torbel SARL" in a conversation does NOT create a
    //     duplicate — the org core finds the existing card, the surface form becomes an alias.
    {
      name: "affixe-societe",
      prompts: [
        "Je viens de recevoir les statuts mis à jour : la société de notre cliente s'appelle officiellement Atelier Torbel SARL au registre du commerce — c'est bien la même entreprise que le client principal dont on parle depuis le début, simplement avec sa forme juridique complète. Retiens leur numéro de dossier interne AS-2026-118 aussi, on va en avoir besoin pour toute la paperasse de fin d'année, notamment pour le contrat cadre signé en janvier et les avenants qui arrivent.",
      ],
      ner: { ...NER, "Atelier Torbel": "company" },
      mock: [says("Bien noté : forme juridique complète et numéro de dossier enregistrés.")],
      extractor: ({ fake }) =>
        JSON.stringify({
          profil: null,
          faits: [{ entite: `${fake("Atelier Torbel")} SARL`, alias: null, cat: "organisation", fait: "Contrat cadre signé en janvier, dossier interne AS-2026-118." }],
        }),
      expect: (ctx) => {
        const sud = ctx.memory.cards.filter((c) => c.entity.toLowerCase().includes("atelier torbel"));
        if (sud.length !== 1) {
          const detail = sud.map((c) => `« ${c.entity} » [${c.cat}${c.aliases?.length ? ` ; alias: ${c.aliases.join(", ")}` : ""}]`).join(" · ");
          throw new Error(`« Atelier Torbel SARL » a créé un DOUBLON — ${sud.length} cartes : ${detail}`);
        }
        if (!/contrat cadre/i.test(sud[0].facts)) throw new Error("le fait n'a pas rejoint la carte existante");
        if (!ctx.live && !(sud[0].aliases ?? []).some((a) => /sarl/i.test(a))) {
          throw new Error("la forme juridique n'est pas devenue un alias de la carte");
        }
      },
    },

    // 8 ─ AMBIGUOUS SEARCH: bare "Claire" injects NOTHING (homograph) —
    //     the model must SEARCH, and memory returns BOTH homonyms.
    {
      name: "recherche-ambigue",
      prompts: ["Je ne sais plus laquelle des deux Claire gère quoi — cherche dans ta mémoire et rappelle-moi qui fait quoi."],
      ner: {},
      mock: [
        calls({ name: "memory_search", args: { query: "Claire" } }),
        (req: MockRequest) => {
          const tool = String([...req.messages].reverse().find((m) => m.role === "tool")?.content ?? "");
          const names = [...tool.matchAll(/^(\S[^(\n]*) \(personne\)/gm)].map((m) => m[1].trim());
          return says(`Vous connaissez ${names.length} Claire : ${names.join(" et ")} — l'une technique, l'autre cliente.`);
        },
      ],
      expect: (ctx) => {
        const searched = ctx.run.transcript.events.some(
          (e) => e.t === "model:out" && e.calls.some((c) => c.name === "memory_search"),
        );
        if (!searched) throw new Error("le modèle n'a pas cherché en mémoire malgré l'ambiguïté");
        assertNotOnWire(ctx, "Claire Fontaine");
        assertNotOnWire(ctx, "Claire Vernaux");
        const shown = String(ctx.run.lastAssistant()?.content ?? "");
        if (!/fontaine/i.test(shown) || !/vernaux/i.test(shown)) {
          throw new Error(`la réponse ne restitue pas LES DEUX homonymes — « ${shown.slice(0, 140)} »`);
        }
      },
    },

    // 9 ─ CROSS-CUTTING FACT: a card updated across phases stays ONE coherent
    //     story — Atelier Torbel's recall carries contract + delay, with no duplicate.
    {
      name: "coherence-finale",
      prompts: ["Fais le point administratif complet sur Atelier Torbel avant la clôture."],
      ner: NER,
      mock: [says("Point administratif : contrat cadre en règle, vigilance sur les délais de paiement.")],
      expect: (ctx) => {
        if (!hasBlock(ctx)) throw new Error("la carte Atelier Torbel n'a pas été rappelée");
        if (!/contrat cadre|as-2026/i.test(ctx.wire)) throw new Error("le fait contractuel (phase 7) manque au rappel");
        if (!/retard/i.test(ctx.wire)) throw new Error("le fait historique (retard de paiement) manque au rappel");
        assertNotOnWire(ctx, "Atelier Torbel");
        const sud = ctx.memory.cards.filter((c) => c.entity.toLowerCase().includes("atelier torbel"));
        if (sud.length !== 1) throw new Error(`la mémoire finale porte ${sud.length} cartes Atelier Torbel`);
      },
    },
  ],
};
