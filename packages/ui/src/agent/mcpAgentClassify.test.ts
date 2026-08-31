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
    // Not a parity test between two copies: there is only one implementation left.
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
    // Intended consequence: `readOnlyToolDefs()` (the loop's forced retry) will no
    // longer offer a tool with a generic name — a forced retry is not a mandate to
    // act.
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
    // Both verbs together: the user asked for the send, the guard steps aside.
    expect(asksDraftNotSend("Rédige un email et envoie-le à Nathan")).toBe(false);
    expect(asksDraftNotSend("")).toBe(false);
  });
});

describe("une INTERDICTION d'envoyer contient le verbe « envoyer » — le piège", () => {
  it("« N'envoie rien » est respecté, pas lu comme un ordre d'envoi", () => {
    // The REAL message from the 27/07/2026 journal: the guard read it as a send
    // request ("envoie" appears in it), and the email went out against the instruction.
    const reel =
      "Passe en revue mes e-mails reçus depuis hier 18 h.\n\n3. Pour les trois plus " +
      "urgents, propose un brouillon de réponse.\n\nN'envoie rien : montre-moi d'abord.";
    expect(asksDraftNotSend(reel)).toBe(true);
  });

  it("couvre les formes courantes de l'interdiction, sans verbe de rédaction requis", () => {
    // Saying "send nothing" is enough: no reason to also require a "draft" verb.
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
  // Journal 27/07/2026: the most explicit phrasing of a search request triggered
  // nothing. The browser was therefore not offered, the model guessed a tool name,
  // and the loop mis-attributed the resulting connector.
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

  // A model hammering a click is exactly the runaway this backstop exists to
  // stop — the raised cap applies only to READS.
  it("ne relève PAS le plafond des primitives d'action du navigateur", () => {
    for (const t of ["browser__browser_click", "browser__browser_type", "browser__browser_fill_form"]) {
      expect(maxSameToolCalls(t), t).toBe(MAX_SAME_TOOL);
    }
  });

  // The name doesn't confer the capability: a hostile server calling its tool
  // `browser_navigate` doesn't buy 20 calls (same bar as clear-mode).
  it("n'accorde le plafond relevé qu'à une ATTRIBUTION, jamais à un nom", () => {
    expect(maxSameToolCalls("evil__browser_navigate")).toBe(MAX_SAME_TOOL);
  });
});

describe("isConfidentReadOnly — le nom du VENDEUR n'est pas la commande", () => {
  it("un serveur qui répète son nom dans chaque outil est enfin lu comme une lecture", () => {
    // Notion and Slack prefix all their tools with their own name; the client
    // re-prefixes. The verb ended up hidden behind a brand and nothing got parallelised.
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
    // `gmail__get_message` doesn't start with "gmail" on the bare-name side: nothing to strip.
    expect(isConfidentReadOnly("gmail__get_message")).toBe(true);
    // A bare name starting with something else stays intact — and so refused.
    expect(isConfidentReadOnly("stripe__api_read")).toBe(false);
    expect(isConfidentReadOnly("posthog__exec")).toBe(false);
  });

  it("⚠️ retirer le vendeur ne doit ouvrir AUCUNE écriture", () => {
    // The exact trap the fix addresses: `browser_check` CHECKS a checkbox. Once "browser"
    // is stripped it becomes `check`, a read verb — it must stay refused.
    expect(isConfidentReadOnly("browser__browser_check")).toBe(false);
    expect(isConfidentReadOnly("notion__notion-delete-page")).toBe(false);
    expect(isConfidentReadOnly("slack__slack_send_message")).toBe(false);
    expect(isConfidentReadOnly("notion__notion_get_and_send")).toBe(false);
  });
});

describe("isConfidentReadOnly — le navigateur ne se parallélise jamais", () => {
  it("un onglet unique : même une LECTURE de page est refusée au préchargement", () => {
    // CDP is process-global and there is only one tab: two concurrent `snapshot`s
    // around a navigation describe no page in particular. And "emit them together"
    // (batchReads, same predicate) is bad advice for the same reason.
    for (const n of [
      "browser__browser_snapshot",
      "browser__browser_take_screenshot",
      "browser__browser_navigate",
      "browser_snapshot",
    ])
      expect(isConfidentReadOnly(n)).toBe(false);
  });

  it("un navigateur TIERS suit la même convention, donc la même exclusion", () => {
    // The exclusion used to hinge on a naming accident; it is now explicit.
    expect(isConfidentReadOnly("playwright__browser_get_page")).toBe(false);
  });
});
