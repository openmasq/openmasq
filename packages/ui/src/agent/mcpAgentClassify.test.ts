import { describe, expect, it } from "vitest";
import {
  asksDraftNotSend,
  isConfidentReadOnly,
  isSendTool,
  isWriteTool,
  looksWebIntent,
  maxSameToolCalls,
  MAX_SAME_TOOL,
  MAX_SAME_WEB_READ,
} from "./mcpAgentClassify";
import { classifyToolWrite } from "@openmasq/catalog/mcp";

describe("isWriteTool — un seul classifieur, des deux côtés de la frontière (règle 9)", () => {
  it("délègue au classifieur du catalog — la MÊME fonction que le write-gate de main", () => {
    // Pas un test de parité entre deux copies : il n'y a plus qu'une implémentation.
    for (const n of ["gmail__send_email", "linear__get_issue", "acme__frobnicate", "stripe__customers"]) {
      expect(isWriteTool(n), n).toBe(classifyToolWrite(n));
    }
    expect(isWriteTool("x__thing", "Retrieve a resource")).toBe(
      classifyToolWrite("x__thing", undefined, "Retrieve a resource"),
    );
    expect(isWriteTool("x__thing", undefined, { readOnlyHint: true })).toBe(
      classifyToolWrite("x__thing", { readOnlyHint: true }),
    );
  });

  it("⚠️ inconnu ⇒ ÉCRITURE (fail closed — l'UI répondait « lecture », l'audit A)", () => {
    // Conséquence voulue : `readOnlyToolDefs()` (le rappel forcé de la boucle) ne
    // proposera plus un outil au nom générique — un rappel forcé n'est pas un mandat
    // pour agir.
    for (const n of ["notion__notion-duplicate-page", "linear__issue", "stripe__customers"]) {
      expect(isWriteTool(n), n).toBe(true);
    }
  });

  it("les lectures à préfixe vendeur restent des lectures (pas de sur-confirmation)", () => {
    for (const n of ["notion__notion-fetch", "stripe__stripe_api_read", "stripe__stripe_api_details"]) {
      expect(isWriteTool(n), n).toBe(false);
    }
  });
});

describe("« rédiger » n'est pas « envoyer » — la garde déterministe", () => {
  it("reconnaît les outils d'ENVOI, préfixe connecteur compris", () => {
    for (const t of ["gmail__send_email", "slack__send_message", "outlook__reply_email", "send_email"]) {
      expect(isSendTool(t), t).toBe(true);
    }
  });

  it("ne prend pas un outil de lecture ou de rédaction pour un envoi", () => {
    for (const t of ["gmail__search_emails", "gmail__create_draft", "notion__create_page", "slack__list_channels"]) {
      expect(isSendTool(t), t).toBe(false);
    }
  });

  it("« rédige » sans verbe d'envoi ⇒ brouillon ; « envoie » ⇒ envoi", () => {
    expect(asksDraftNotSend("Rédige un email de remerciement à nathan@hotmail.fr.")).toBe(true);
    expect(asksDraftNotSend("Écris-lui un mot pour la réunion")).toBe(true);
    expect(asksDraftNotSend("Envoie un email de remerciement à nathan@hotmail.fr.")).toBe(false);
    // Les deux verbes ensemble : l'utilisateur a demandé l'envoi, la garde s'efface.
    expect(asksDraftNotSend("Rédige un email et envoie-le à Nathan")).toBe(false);
    expect(asksDraftNotSend("")).toBe(false);
  });
});

describe("une INTERDICTION d'envoyer contient le verbe « envoyer » — le piège", () => {
  it("« N'envoie rien » est respecté, pas lu comme un ordre d'envoi", () => {
    // Le message RÉEL du journal du 27/07/2026 : la garde l'a lu comme une demande
    // d'envoi (« envoie » y figure), et l'e-mail est parti contre la consigne.
    const reel =
      "Passe en revue mes e-mails reçus depuis hier 18 h.\n\n3. Pour les trois plus " +
      "urgents, propose un brouillon de réponse.\n\nN'envoie rien : montre-moi d'abord.";
    expect(asksDraftNotSend(reel)).toBe(true);
  });

  it("couvre les formes courantes de l'interdiction, sans verbe de rédaction requis", () => {
    // Dire « ne rien envoyer » suffit : aucune raison d'exiger en plus un « rédige ».
    for (const t of [
      "N'envoie rien",
      "N’envoie pas ce mail",
      "ne pas envoyer pour l'instant",
      "sans rien envoyer",
      "don't send it yet",
      "do not send",
    ]) {
      expect(asksDraftNotSend(t), t).toBe(true);
    }
  });

  it("mais un envoi explicite passe toujours — la garde ne sur-bloque pas", () => {
    expect(asksDraftNotSend("Envoie un email de remerciement à Nathan")).toBe(false);
    expect(asksDraftNotSend("Rédige un email et envoie-le à Nathan")).toBe(false);
  });
});

describe("looksWebIntent — « fais des recherches sur X »", () => {
  // Journal du 27/07/2026 : la formulation la plus explicite d'une demande de recherche
  // ne déclenchait rien. Le navigateur n'était donc pas offert, le modèle a deviné un nom
  // d'outil, et la boucle a mal attribué le connecteur qui en découle.
  it.each([
    "fait des recherches sur Vera et ses membres",
    "fais des recherches sur cette entreprise",
    "faites-moi une recherche sur ce sujet",
    "renseigne-toi sur ce fournisseur",
    "documente-toi sur le sujet",
    "research this company",
    "find out who they are",
  ])("déclenche sur : %s", (t) => {
    expect(looksWebIntent(t)).toBe(true);
  });

  it("ne déclenche pas sur une demande sans rapport", () => {
    expect(looksWebIntent("résume ce document")).toBe(false);
    expect(looksWebIntent("calcule la moyenne de ces chiffres")).toBe(false);
  });
});

describe("plafond par outil — chercher n'est pas marteler", () => {
  it("relève le plafond des LECTURES web gouvernées", () => {
    for (const t of ["browser__browser_navigate", "browser__browser_snapshot", "web_fetch_many"]) {
      expect(maxSameToolCalls(t), t).toBe(MAX_SAME_WEB_READ);
    }
  });

  it("garde le plafond ordinaire pour tout le reste", () => {
    for (const t of ["posthog__exec", "gmail__search", "run_python", "notion__search"]) {
      expect(maxSameToolCalls(t), t).toBe(MAX_SAME_TOOL);
    }
  });

  // Un modèle qui martèle un clic est exactement l'emballement que ce garde-fou
  // existe pour arrêter — le relèvement ne vaut que pour la LECTURE.
  it("ne relève PAS le plafond des primitives d'action du navigateur", () => {
    for (const t of ["browser__browser_click", "browser__browser_type", "browser__browser_fill_form"]) {
      expect(maxSameToolCalls(t), t).toBe(MAX_SAME_TOOL);
    }
  });

  // Le nom ne confère pas la capacité : un serveur hostile qui appelle son outil
  // `browser_navigate` n'achète pas 20 appels (même barre que le clear-mode).
  it("n'accorde le plafond relevé qu'à une ATTRIBUTION, jamais à un nom", () => {
    expect(maxSameToolCalls("evil__browser_navigate")).toBe(MAX_SAME_TOOL);
  });
});

describe("isConfidentReadOnly — le nom du VENDEUR n'est pas la commande", () => {
  it("un serveur qui répète son nom dans chaque outil est enfin lu comme une lecture", () => {
    // Notion et Slack préfixent tous leurs outils de leur propre nom ; le client
    // re-préfixe. Le verbe se retrouvait derrière une marque et rien ne se parallélisait.
    for (const n of [
      "notion__notion-fetch",
      "notion__notion-search",
      "notion__notion-get-comments",
      "notion__notion-query-data-sources",
      "notion__notion-download-attachment",
      "slack__slack_read_canvas",
      "slack__slack_read_user_profile",
      "slack__slack_list_channel_members",
      "slack__slack_search_public",
    ])
      expect(isConfidentReadOnly(n)).toBe(true);
  });

  it("le retrait ne mord que sur le vendeur RÉPÉTÉ, jamais sur la commande", () => {
    // `gmail__get_message` ne commence pas par « gmail » côté nom nu : rien à retirer.
    expect(isConfidentReadOnly("gmail__get_message")).toBe(true);
    // Un nom nu qui commence par autre chose reste intact — et donc refusé.
    expect(isConfidentReadOnly("stripe__api_read")).toBe(false);
    expect(isConfidentReadOnly("posthog__exec")).toBe(false);
  });

  it("⚠️ retirer le vendeur ne doit ouvrir AUCUNE écriture", () => {
    // Le piège exact du correctif : `browser_check` COCHE une case. Une fois « browser »
    // retiré il devient `check`, un verbe de lecture — il doit rester refusé.
    expect(isConfidentReadOnly("browser__browser_check")).toBe(false);
    expect(isConfidentReadOnly("notion__notion-delete-page")).toBe(false);
    expect(isConfidentReadOnly("slack__slack_send_message")).toBe(false);
    expect(isConfidentReadOnly("notion__notion_get_and_send")).toBe(false);
  });
});

describe("isConfidentReadOnly — le navigateur ne se parallélise jamais", () => {
  it("un onglet unique : même une LECTURE de page est refusée au préchargement", () => {
    // CDP est global au processus et il n'y a qu'un onglet : deux `snapshot` concurrents
    // autour d'une navigation ne décrivent aucune page en particulier. Et « émets-les
    // ensemble » (batchReads, même prédicat) est un mauvais conseil pour la même raison.
    for (const n of [
      "browser__browser_snapshot",
      "browser__browser_take_screenshot",
      "browser__browser_navigate",
      "browser_snapshot",
    ])
      expect(isConfidentReadOnly(n)).toBe(false);
  });

  it("un navigateur TIERS suit la même convention, donc la même exclusion", () => {
    // L'exclusion tenait à un accident de nommage ; elle est désormais explicite.
    expect(isConfidentReadOnly("playwright__browser_get_page")).toBe(false);
  });
});
