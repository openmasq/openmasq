import { calls, says, type MockRequest } from "./mockModel";
import type { MemoryLifeScenario } from "./memoryLife";
import { assertNotOnWire, card, hasBlock, mustCard } from "./memoryScenarios";

// MÉMOIRE IMBRIQUÉE — un réseau d'entités FORTEMENT liées et volontairement
// confondantes : deux Claires, deux frères Grimonet, un projet ET une société
// homonymes (« Ondine »), un comptable dont le nom entier est fait de mots courants
// (« Pierre Marché »). Chaque phase mesure que le rappel reste PRÉCIS (le bon
// homonyme), HONNÊTE (l'ambiguïté réelle expose les deux cartes), et que la mémoire
// se MET À JOUR (contradiction → remplacement, « SARL » → même carte).

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
    // 1a ─ SEED (personnes) : les paires confondantes humaines. Le cap produit
    //     MAX_EXTRACTED_FACTS (6) impose de semer un réseau dense en PLUSIEURS
    //     conversations — c'est aussi comme ça que la mémoire grandit en vrai.
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

    // 1b ─ SEED (entités) : les homonymes projet/société + le comptable homographe.
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

    // 2 ─ HOMONYME PRÉCIS : le nom COMPLET ne rappelle QUE la bonne Claire — le
    //     prénom partagé (« claire », homographe dénylisté) ne déborde pas sur l'autre.
    {
      name: "homonyme-precis",
      prompts: ["Prépare l'ordre du jour du point technique avec Claire Vernaux pour lundi."],
      ner: NER,
      mock: [says("Ordre du jour du point technique préparé.")],
      expect: (ctx) => {
        if (!hasBlock(ctx)) throw new Error("la carte de Claire Vernaux n'a pas été rappelée");
        if (!/directrice technique/i.test(ctx.wire)) throw new Error("le fait de la BONNE Claire manque");
        // UNE seule carte personne doit venir — le FAIT de Vernaux peut légitimement
        // mentionner l'autre Claire (« à ne pas confondre avec… ») : compter les
        // CARTES injectées, pas les mots.
        const persons = ctx.wire.match(/^- .+ \(personne\) :/gm) ?? [];
        if (persons.length !== 1) throw new Error(`la MAUVAISE Claire a été injectée aussi (${persons.length} cartes personne)`);
        assertNotOnWire(ctx, "Claire Vernaux");
      },
    },

    // 3 ─ HOMONYME AMBIGU : « les Grimonet » — l'ambiguïté est RÉELLE, les DEUX
    //     cartes doivent venir (choisir en silence serait une erreur du système).
    {
      name: "homonyme-ambigu",
      prompts: ["Fais-moi un récapitulatif de ce qu'on sait sur les Grimonet avant ma réunion."],
      ner: {},
      mock: [says("Récap : l'un gère vos impressions, l'autre est votre avocat d'affaires.")],
      expect: (ctx) => {
        if (!/imprim|tirage|papier/i.test(ctx.wire)) throw new Error("la carte de Baptiste (imprimeur) manque");
        if (!/avocat/i.test(ctx.wire)) throw new Error("la carte de Marc (avocat) manque");
        // Les noms COMPLETS ne vivent que dans le bloc (forcés) — le « Grimonet » nu
        // tapé par l'utilisateur suit la réalité produit (détection, pas forced).
        assertNotOnWire(ctx, "Baptiste Grimonet");
        assertNotOnWire(ctx, "Marc Grimonet");
      },
    },

    // 4 ─ HOMOGRAPHE PIÈGE : une phrase pleine de mots courants qui sont AUSSI des
    //     noms (« pierre », « marché », « fontaine », « claire ») ne rappelle RIEN.
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

    // 5 ─ CONFUSION PROJET/SOCIÉTÉ : « Ondine » évoque LES DEUX cartes homonymes —
    //     le modèle reçoit de quoi distinguer, avec les faits qui les séparent.
    {
      name: "confusion-homonymes",
      prompts: ["Où en est Ondine ? Et au fait, prépare la facture annuelle pour la société Ondine SARL."],
      ner: NER,
      mock: [says("Le projet avance vers sa deadline ; la facture d'hébergement annuelle de la société homonyme est prête.")],
      expect: (ctx) => {
        // Robuste au phrasé d'un extracteur vivant : on exige les DEUX catégories de
        // cartes injectées (une ligne projet ET une ligne organisation), pas des mots.
        if (!/^- .+ \(projet\) :/m.test(ctx.wire)) throw new Error("la carte PROJET Ondine manque");
        if (!/^- .+ \(organisation\) :/m.test(ctx.wire)) throw new Error("la carte SOCIÉTÉ Ondine SARL manque");
        assertNotOnWire(ctx, "Ondine SARL");
      },
    },

    // 6 ─ CONTRADICTION → MISE À JOUR : la nouvelle deadline REMPLACE l'ancienne dans
    //     la carte (le levier `mergeFacts`) — jamais les deux côte à côte.
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
        // Sélection EXACTE (entity === "Ondine", cat projet) : le helper par inclusion
        // attraperait la carte « Ondine SARL » — l'homonymie piège aussi les asserts.
        const ondine = ctx.memory.cards.find((c) => c.entity === "Ondine" && c.cat === "projet");
        if (!ondine) throw new Error("carte PROJET Ondine introuvable");
        if (!/novembre/i.test(ondine.facts)) throw new Error("la nouvelle deadline n'a pas été retenue");
        if (!ctx.live && /septembre/i.test(ondine.facts)) {
          throw new Error(`l'ANCIENNE deadline cohabite avec la nouvelle — carte : « ${ondine.facts} »`);
        }
      },
    },

    // 7 ─ AFFIXE SOCIÉTÉ : « Atelier Torbel SARL » dans une conversation ne crée PAS de
    //     doublon — le cœur org retrouve la carte existante, la surface devient alias.
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
        const torbel = ctx.memory.cards.filter((c) => c.entity.toLowerCase().includes("atelier torbel"));
        if (torbel.length !== 1) {
          const detail = torbel.map((c) => `« ${c.entity} » [${c.cat}${c.aliases?.length ? ` ; alias: ${c.aliases.join(", ")}` : ""}]`).join(" · ");
          throw new Error(`« Atelier Torbel SARL » a créé un DOUBLON — ${torbel.length} cartes : ${detail}`);
        }
        if (!/contrat cadre/i.test(torbel[0].facts)) throw new Error("le fait n'a pas rejoint la carte existante");
        if (!ctx.live && !(torbel[0].aliases ?? []).some((a) => /sarl/i.test(a))) {
          throw new Error("la forme juridique n'est pas devenue un alias de la carte");
        }
      },
    },

    // 8 ─ RECHERCHE AMBIGUË : « Claire » tout court n'injecte RIEN (homographe) —
    //     le modèle doit CHERCHER, et la mémoire renvoie LES DEUX homonymes.
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

    // 9 ─ FAIT CROISÉ : une carte mise à jour au fil des phases reste UNE histoire
    //     cohérente — le rappel d'Atelier Torbel porte contrat + retard, sans doublon.
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
        const torbel = ctx.memory.cards.filter((c) => c.entity.toLowerCase().includes("atelier torbel"));
        if (torbel.length !== 1) throw new Error(`la mémoire finale porte ${torbel.length} cartes Atelier Torbel`);
      },
    },
  ],
};
