import { makeMemoryCard, MEMORY_BUDGET_CHARS } from "../memory";
import type { MemoryData } from "../types";
import { calls, says, type MockRequest } from "./mockModel";
import type { MemoryLifeScenario, MemoryPhaseCtx } from "./memoryLife";

// LA VIE D'UNE MÉMOIRE — un scénario progressif en 8 conversations : rétention
// (avec piège anti-hallucination), dédup naturelle, note explicite, rappel direct
// redacted, silence hors-sujet, rappel par prénom seul, `memory_search` en longue
// traîne, et tenue sous une mémoire qui a GROSSI (bruit + budget). Chaque phase
// asserte l'état de la mémoire ET ce qui a traversé le wire.

const NER = {
  "Karl Studio": "company",
  "Atelier Torbel": "company",
  "Claire Fontaine": "name",
  "Baptiste Grimonet": "name",
};

/** La carte d'une entité, par clé normalisée en gros (case-insensitive). */
export function card(m: MemoryData, entity: string) {
  const k = entity.toLowerCase();
  return m.cards.find((c) => [c.entity, ...(c.aliases ?? [])].some((s) => s.toLowerCase().includes(k)));
}
export function mustCard(ctx: MemoryPhaseCtx, entity: string) {
  const c = card(ctx.memory, entity);
  if (!c) throw new Error(`mémoire sans carte « ${entity} » — cartes : ${ctx.memory.cards.map((x) => x.entity).join(" · ") || "(aucune)"}`);
  return c;
}
/** Le wire ne doit JAMAIS porter cette valeur réelle (hors legs tool, déjà exclus :
 *  `wire` ne contient que les model:in — system/user/assistant/tool re-redacted). */
export function assertNotOnWire(ctx: MemoryPhaseCtx, real: string): void {
  if (ctx.wire.toLowerCase().includes(real.toLowerCase())) {
    throw new Error(`FUITE mémoire : « ${real} » (réel) présent dans le wire`);
  }
}
export const hasBlock = (ctx: MemoryPhaseCtx): boolean => ctx.wire.includes("Mémoire de l'utilisateur");

export const MEMORY_LIFE: MemoryLifeScenario = {
  name: "vie-de-memoire",
  phases: [
    // 1 ─ RÉTENTION : un contexte riche ; l'extracteur glisse une entité INVENTÉE
    //     (« Studio Boreal ») que l'ancrage verbatim doit silencieusement jeter.
    {
      name: "retention",
      prompts: [
        "Pour te donner le contexte avant qu'on travaille ensemble : je suis directeur artistique chez Karl Studio, une agence de design d'une dizaine de personnes. Notre client principal est Atelier Torbel — le contact là-bas est Claire Fontaine (claire@atelier-torbel.fr), et il faut savoir qu'elle paie souvent ses factures en retard, ce qui nous pose des problèmes de trésorerie. Le projet en cours pour eux s'appelle Ondine : une refonte complète de leur site vitrine, avec une deadline ferme fin septembre. Côté fournisseurs, notre imprimeur attitré est Baptiste Grimonet — c'est lui qui gère tous nos tirages papier.",
      ],
      ner: NER,
      mock: [says("Bien noté — contexte enregistré, je m'en servirai pour la suite.")],
      extractor: ({ fake }) =>
        JSON.stringify({
          profil: "Directeur artistique.",
          faits: [
            { entite: fake("Karl Studio"), alias: null, cat: "organisation", fait: "L'employeur de l'utilisateur (directeur artistique)." },
            { entite: fake("Atelier Torbel"), alias: null, cat: "organisation", fait: "Client principal, paie souvent ses factures en retard." },
            { entite: fake("Claire Fontaine"), alias: fake("claire@atelier-torbel.fr"), cat: "personne", fait: "Contact chez le client principal." },
            { entite: "Ondine", alias: null, cat: "projet", fait: "Refonte complète du site du client, deadline fin septembre." },
            { entite: fake("Baptiste Grimonet"), alias: null, cat: "personne", fait: "Imprimeur attitré." },
            // HALLUCINATION délibérée : n'apparaît nulle part dans la conversation.
            { entite: "Studio Boreal", alias: null, cat: "organisation", fait: "Partenaire imaginaire." },
          ],
        }),
      expect: (ctx) => {
        for (const e of ["Karl Studio", "Atelier Torbel", "Claire Fontaine", "Ondine", "Baptiste Grimonet"]) mustCard(ctx, e);
        if (card(ctx.memory, "Studio Boreal")) throw new Error("l'entité HALLUCINÉE a franchi l'ancrage verbatim");
        const claire = mustCard(ctx, "Claire Fontaine");
        if (!ctx.live && !(claire.aliases ?? []).some((a) => a.includes("@"))) {
          throw new Error("l'alias e-mail de Claire n'a pas été retenu");
        }
        if (!ctx.memory.profile?.toLowerCase().includes("directeur")) {
          if (!ctx.live) throw new Error("le profil explicite n'a pas été retenu");
        }
      },
    },

    // 2 ─ DÉDUP NATURELLE : le même fait reformulé ne double PAS ; le fait nouveau
    //     (« relance à J+10 ») rejoint la MÊME carte — jamais une seconde.
    {
      name: "dedup",
      prompts: [
        "Je reviens sur le sujet de la facturation dont on a déjà parlé : pour rappel, Claire Fontaine d'Atelier Torbel paie souvent ses factures en retard — c'est un problème récurrent depuis le début de l'année et ça n'a pas changé malgré les rappels. Du coup on a pris une décision en interne cette semaine : on passe à une relance systématique à J+10 après émission de chaque facture, sans exception, avec un e-mail de rappel automatique puis un appel téléphonique si rien ne bouge sous huit jours.",
      ],
      ner: NER,
      mock: [says("Compris : relance systématique à J+10 pour ce client.")],
      extractor: ({ fake }) =>
        JSON.stringify({
          profil: null,
          faits: [
            { entite: fake("Atelier Torbel"), alias: null, cat: "organisation", fait: "paie souvent ses factures en retard" },
            { entite: fake("Atelier Torbel"), alias: null, cat: "organisation", fait: "Relance systématique à J+10 après émission." },
          ],
        }),
      expect: (ctx) => {
        const sud = ctx.memory.cards.filter((c) => c.entity.toLowerCase().includes("atelier torbel"));
        if (sud.length !== 1) throw new Error(`dédup en échec : ${sud.length} cartes « Atelier Torbel »`);
        // En vivant, l'extracteur peut légitimement attacher la décision à la
        // CONTACT (Claire) plutôt qu'à la société — l'important est qu'elle soit retenue.
        const holder = ctx.live ? ctx.memory.cards : sud;
        if (!holder.some((c) => /j\s*\+\s*10/i.test(c.facts))) throw new Error("le fait NOUVEAU (J+10) n'a pas rejoint la mémoire");
        const retards = sud[0].facts.toLowerCase().split("retard").length - 1;
        if (!ctx.live && retards !== 1) throw new Error(`fait dupliqué : « retard » apparaît ${retards} fois dans la carte`);
      },
    },

    // 3 ─ NOTE EXPLICITE : « retiens ça » sans nom propre → carte-note (cat autre),
    //     l'ancrage verbatim est relâché PARCE QUE l'utilisateur l'a demandé.
    {
      name: "note-explicite",
      prompts: ["Retiens ça : les rétrospectives d'équipe ont lieu le vendredi à 15h, en visio."],
      mock: [says("C'est noté dans la mémoire.")],
      extractor: () =>
        JSON.stringify({
          profil: null,
          faits: [{ entite: "Rétrospectives d'équipe", alias: null, cat: "autre", fait: "Ont lieu le vendredi à 15h, en visio." }],
        }),
      expect: (ctx) => {
        const c = mustCard(ctx, "rétrospective");
        if (!/vendredi/i.test(c.facts)) throw new Error("la note explicite n'a pas retenu le contenu (vendredi)");
      },
    },

    // 4 ─ RAPPEL DIRECT : nouvelle conversation qui NOMME le client → le bloc mémoire
    //     est injecté, REDACTED (les entités réelles n'atteignent jamais le wire),
    //     et la réponse affichée revient en valeurs réelles.
    {
      name: "rappel-direct",
      prompts: ["Rédige un e-mail de relance de facture pour Atelier Torbel, adressé à Claire Fontaine."],
      ner: NER,
      mock: [
        (req: MockRequest) => {
          const sys = String(req.messages.find((m) => m.role === "system")?.content ?? "");
          const m = /- (\S[^(\n]*) \(personne\)/.exec(sys); // la carte injectée (fake) du contact
          return says(`Voici l'e-mail de relance, adressé à ${m?.[1]?.trim() ?? "la contact"} — ton courtois, rappel du délai J+10.`);
        },
      ],
      expect: (ctx) => {
        if (!hasBlock(ctx)) throw new Error("bloc mémoire ABSENT du wire alors que le client est nommé");
        if (!/retard|j\s*\+\s*10/i.test(ctx.wire)) throw new Error("le FAIT mémoire (retard/J+10) n'accompagne pas le bloc");
        assertNotOnWire(ctx, "Atelier Torbel");
        assertNotOnWire(ctx, "Claire Fontaine");
        const shown = String(ctx.run.lastAssistant()?.content ?? "");
        if (!ctx.live && !/claire fontaine/i.test(shown)) {
          throw new Error("la réponse affichée ne restitue pas la vraie contact (un-redaction)");
        }
      },
    },

    // 5 ─ SILENCE : une question sans AUCUN rapport ne doit injecter AUCUNE mémoire.
    {
      name: "silence",
      prompts: ["Quelle est la capitale de l'Australie ?"],
      mock: [says("Canberra.")],
      expect: (ctx) => {
        // Le PROFIL s'injecte toujours (étage fixe) — ce sont les CARTES qui doivent
        // rester dehors : aucune ligne « - X (personne|organisation|projet|autre) : ».
        if (/^- .+ \((personne|organisation|projet|autre)\) :/m.test(ctx.wire)) {
          throw new Error("des cartes mémoire ont été injectées sur un sujet sans rapport");
        }
        for (const real of ["Karl Studio", "Atelier Torbel", "Claire Fontaine", "Baptiste Grimonet", "Ondine"]) assertNotOnWire(ctx, real);
      },
    },

    // 6 ─ RAPPEL PAR PRÉNOM SEUL : « Baptiste » suffit (tier token) — la carte
    //     complète arrive, le nom complet réel reste protégé.
    {
      name: "rappel-token",
      prompts: ["Relance Baptiste au sujet des délais d'impression, s'il te plaît."],
      mock: [says("Je prépare la relance pour l'imprimeur au sujet des délais.")],
      expect: (ctx) => {
        if (!hasBlock(ctx)) throw new Error("le prénom seul n'a pas rappelé la carte (tier token)");
        // Le FAIT de la carte accompagne le rappel — un extracteur vivant reformule
        // (« gère les tirages papier ») : on accepte le champ lexical, pas un mot exact.
        if (!/imprimeur|tirages?|impression|papier/i.test(ctx.wire)) {
          throw new Error("le fait de la carte (imprimeur/tirages) n'accompagne pas le rappel");
        }
        assertNotOnWire(ctx, "Grimonet");
      },
    },

    // 7 ─ MEMORY_SEARCH (longue traîne) : rien à mentionner → rien à injecter → le
    //     modèle doit ALLER CHERCHER, et le résultat re-redacted revient réel à l'écran.
    {
      name: "memory-search",
      prompts: ["Un de mes clients règle toujours ses factures en retard — lequel, déjà ? Vérifie dans ta mémoire et propose une action."],
      mock: [
        calls({ name: "memory_search", args: { query: "client factures retard" } }),
        (req: MockRequest) => {
          const tool = String([...req.messages].reverse().find((m) => m.role === "tool")?.content ?? "");
          const m = /^(\S[^(\n]*) \(organisation\)/m.exec(tool);
          return says(`C'est ${m?.[1]?.trim() ?? "?"} — je propose d'appliquer la relance J+10.`);
        },
      ],
      expect: (ctx) => {
        // `memory_search` est INTERCEPTÉ par la boucle (jamais proxifié au host MCP) —
        // il se lit sur les model:out, pas sur les tool:out.
        const searched = ctx.run.transcript.events.some(
          (e) => e.t === "model:out" && e.calls.some((c) => c.name === "memory_search"),
        );
        if (!searched) throw new Error("memory_search n'a pas été appelé alors que rien n'était injectable");
        assertNotOnWire(ctx, "Atelier Torbel");
        const shown = String(ctx.run.lastAssistant()?.content ?? "");
        if (!/atelier torbel/i.test(shown)) throw new Error(`la réponse affichée ne restitue pas le vrai client — « ${shown.slice(0, 120)} »`);
      },
    },

    // 8 ─ CROISSANCE : 40 cartes de bruit récentes ; la pertinence doit battre la
    //     récence, le bloc rester sous budget, et le bruit rester dehors.
    {
      name: "croissance-budget",
      growBefore: (m) => ({
        ...m,
        cards: [
          ...Array.from({ length: 40 }, (_, i) => ({
            ...makeMemoryCard({
              entity: `Dossier Interne ${i + 1}`,
              facts: `Notes d'archive numéro ${i + 1} — ${"contexte secondaire sans lien avec le sujet du jour. ".repeat(3)}`,
              cat: "autre",
            })!,
            updatedAt: Date.now() + i,
          })),
          ...m.cards,
        ],
      }),
      prompts: ["Où en est le projet Ondine ? Fais-moi un point avant la deadline."],
      mock: [says("Point Ondine : refonte en cours, l'échéance de fin septembre tient.")],
      expect: (ctx) => {
        if (!hasBlock(ctx)) throw new Error("la carte Ondine n'a pas été rappelée sous une mémoire grossie");
        if (!/septembre|refonte/i.test(ctx.wire)) throw new Error("le fait Ondine n'accompagne pas le bloc");
        if (ctx.wire.includes("Dossier Interne")) throw new Error("du BRUIT (carte sans rapport) a été injecté");
        // Budget : la somme des LIGNES de cartes injectées (peu importe où le bloc
        // vit dans le system) doit tenir sous le budget produit.
        const bullets = ctx.wire.match(/^- .+ \((personne|organisation|projet|autre)\) : .*$/gm) ?? [];
        const injected = bullets.join("\n").length;
        if (injected > MEMORY_BUDGET_CHARS) {
          throw new Error(`cartes injectées au-dessus du budget : ${injected} chars (${bullets.length} cartes)`);
        }
      },
    },
  ],
};
