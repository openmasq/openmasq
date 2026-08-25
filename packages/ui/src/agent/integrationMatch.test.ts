import { describe, expect, it } from "vitest";
import { MCP_CONNECTORS, type McpConnector } from "@openmasq/catalog/mcp";
import { connectorsForRequest, scopePreflight, missingConnectorMessage } from "./integrationMatch";
import { ATTACHMENT_INLINE_NOTE, typedPartOfWire } from "../send/foldPayload";

const pick = (...ids: string[]): McpConnector[] =>
  ids.map((id) => MCP_CONNECTORS.find((c) => c.id === id)!);
const ids = (cs: McpConnector[]) => cs.map((c) => c.id);

describe("connectorsForRequest — proposer sans attendre le modèle", () => {
  const candidates = pick("gmail", "google-calendar", "notion", "stripe", "github");

  it("un DOCUMENT plié ne propose rien : la boucle lit la partie TAPÉE seule (typedPartOfWire)", () => {
    // Le tour signalé (13/08) : « résume ce document » sur un courrier → cartes Square
    // (un mot d'adresse DU document) et Filesystem (le mot « filesystem »… de NOTRE
    // propre note interne, glissée sous chaque en-tête de pièce jointe).
    const docCandidates = pick("square", "filesystem");
    const wire =
      "résume ce document\n\n=== Attached file: document-1.pdf ===\n" +
      `${ATTACHMENT_INLINE_NOTE}\nRendez-vous au 3 Square des Peupliers pour votre dossier.`;
    // Le message wire ENTIER matcherait les deux — c'est le bug d'origine…
    expect(ids(connectorsForRequest(wire, docCandidates))).toEqual(["square", "filesystem"]);
    // …la partie tapée, elle, ne propose rien : c'est elle que la boucle lit désormais.
    expect(connectorsForRequest(typedPartOfWire(wire), docCandidates)).toEqual([]);
    // Et nommer le service DANS ce qu'on tape propose toujours.
    expect(ids(connectorsForRequest(typedPartOfWire(`va voir sur Square\n\n=== Attached file: d.pdf ===\nx`), docCandidates))).toEqual(["square"]);
  });

  it("reconnaît le service par son NOM de marque", () => {
    expect(ids(connectorsForRequest("résume mes pages Notion", candidates))).toEqual(["notion"]);
    expect(ids(connectorsForRequest("combien en caisse sur Stripe ?", candidates))).toContain("stripe");
  });

  it("…et par les mots que les gens tapent vraiment", () => {
    // Le tour signalé : « Revue de ma boîte mail » — l'utilisateur n'écrit jamais « Gmail ».
    expect(ids(connectorsForRequest("Revue de ma boîte mail", candidates))).toEqual(["gmail"]);
    expect(ids(connectorsForRequest("qu'est-ce que j'ai à l'agenda ?", candidates))).toEqual([
      "google-calendar",
    ]);
  });

  it("un nom générique ne compte que SOUS POSSESSIF — sinon on parle du sujet, pas du service", () => {
    // Le tour signalé le 11/08, mot pour mot : aucune carte Gmail ici.
    expect(
      connectorsForRequest(
        "Je me suis créé un compte Loops et je vais envoyer des emails product à un peu " +
          "moins de 100 personnes. Ai-je besoin de warmup avant, ou pas de risque spam ?",
        candidates,
      ),
    ).toEqual([]);
    // Les tournures où le service EST celui de l'utilisateur restent proposées.
    expect(ids(connectorsForRequest("trie mes mails de la semaine", candidates))).toEqual(["gmail"]);
    expect(ids(connectorsForRequest("ma messagerie déborde, fais le ménage", candidates))).toEqual(["gmail"]);
    expect(ids(connectorsForRequest("résume mes e-mails d'hier", candidates))).toEqual(["gmail"]);
    // …et parler d'e-mails en général, jamais.
    expect(connectorsForRequest("quel est le meilleur outil d'emailing ?", candidates)).toEqual([]);
    expect(connectorsForRequest("on s'est parlé par mail hier", candidates)).toEqual([]);
  });

  it("les accents et la casse ne changent rien", () => {
    expect(ids(connectorsForRequest("MA BOÎTE MAIL", candidates))).toEqual(["gmail"]);
    expect(ids(connectorsForRequest("mon Agenda", candidates))).toEqual(["google-calendar"]);
  });

  it("ne propose RIEN sur une coïncidence de sous-chaîne", () => {
    // Une carte proposée par hasard apprend à l'utilisateur à ignorer les cartes.
    expect(connectorsForRequest("prépare un mailing pour la campagne", candidates)).toEqual([]);
    expect(connectorsForRequest("c'est une distinction notionnelle", candidates)).toEqual([]);
    expect(connectorsForRequest("", candidates)).toEqual([]);
  });

  it("ne propose que parmi les candidats — donc jamais un connecteur DÉJÀ branché", () => {
    // `suggestCandidates` = les non connectés ; Gmail absent de la liste = rien à proposer.
    expect(connectorsForRequest("ma boîte mail", pick("notion", "stripe"))).toEqual([]);
  });

  it("un BESOIN déjà servi ne propose pas un second fournisseur", () => {
    // Le tour signalé : Gmail branché, « revue de ma boîte mail » — Outlook partage les
    // mêmes alias génériques et se faisait proposer sous une réponse qui venait de lire
    // la boîte Gmail.
    const notConnected = pick("microsoft-outlook", "notion");
    expect(connectorsForRequest("Revue de ma boîte mail", notConnected, pick("gmail"))).toEqual([]);
    // …et sans Gmail branché, la carte revient : c'est bien la couverture qui décide.
    expect(ids(connectorsForRequest("Revue de ma boîte mail", notConnected))).toEqual([
      "microsoft-outlook",
    ]);
  });

  it("…mais nommer la marque reste une demande EXPLICITE, quoi qu'on ait branché", () => {
    expect(
      ids(connectorsForRequest("récupère aussi mes mails sur Outlook", pick("microsoft-outlook"), pick("gmail"))),
    ).toEqual(["microsoft-outlook"]);
  });

  it("la couverture est par BESOIN, pas globale", () => {
    // Gmail branché ne dispense pas de proposer l'agenda.
    expect(
      ids(connectorsForRequest("qu'est-ce que j'ai à l'agenda ?", pick("google-calendar"), pick("gmail"))),
    ).toEqual(["google-calendar"]);
  });

  it("plafonne comme toute proposition — quatre cartes, c'est déjà du bruit", () => {
    const many = pick("gmail", "microsoft-outlook", "google-calendar", "notion", "stripe");
    expect(connectorsForRequest("mail agenda notion stripe outlook", many).length).toBeLessThanOrEqual(4);
  });
});

describe("scopePreflight — ce qu'un workflow DÉCLARE et qui manque", () => {
  it("nomme les manquants sans rien deviner", () => {
    const r = scopePreflight(["gmail", "notion"], new Set(["notion"]));
    expect(r.missing).toEqual(["gmail"]);
    // Notion répond encore → la routine peut faire une partie du travail.
    expect(r.unusable).toBe(false);
  });

  it("TOUT manque ⇒ inutilisable : aucun appel de modèle ne peut y changer quoi que ce soit", () => {
    expect(scopePreflight(["gmail"], new Set()).unusable).toBe(true);
    expect(scopePreflight(["gmail", "notion"], new Set(["stripe"])).unusable).toBe(true);
  });

  it("normalise une instance multi-comptes et dédoublonne", () => {
    expect(scopePreflight(["gmail--a1b2", "gmail"], new Set()).missing).toEqual(["gmail"]);
    expect(scopePreflight(["gmail--a1b2"], new Set(["gmail"])).missing).toEqual([]);
  });

  it("aucun scope déclaré ⇒ rien à dire (le cas d'un message ordinaire)", () => {
    expect(scopePreflight(undefined, new Set())).toEqual({ missing: [], unusable: false });
    expect(scopePreflight([], new Set())).toEqual({ missing: [], unusable: false });
  });
});

describe("missingConnectorMessage — un échec réel, dit franchement", () => {
  it("nomme le service, dit que RIEN n'a été lancé, et renvoie au bouton", () => {
    const m = missingConnectorMessage(["gmail"]);
    expect(m).toContain("Gmail");
    expect(m).toContain("aucune action");
    expect(m).toContain("ci-dessous");
  });

  it("s'accorde au pluriel", () => {
    const m = missingConnectorMessage(["gmail", "notion"]);
    expect(m).toContain("Ces intégrations ne sont pas connectées");
    expect(m).toContain("Notion");
  });

  it("ne porte que des NOMS de connecteur — jamais le contenu de la demande", () => {
    expect(missingConnectorMessage(["gmail"])).not.toMatch(/boîte|revue/i);
  });
});
