import { describe, it, expect } from "vitest";
import { looksLikeRefusal, isBrowserBackendFault, webToolPhrase, pythonErrorHint } from "./mcpAgentGuidance";
import { namesConnectedConnector } from "./mcpAgentOutcome";

/**
 * `looksLikeRefusal` gates the ONE forced-tool retry (`mcpAgent.ts`, `toolChoice:
 * "required"`) and the "try a more capable model" hint. Nothing else pins it, and it
 * is a regex heuristic on model prose — so the negatives below matter as much as the
 * positives: a false positive hijacks a legitimate conversational answer into a
 * forced tool call.
 */
describe("looksLikeRefusal", () => {
  describe("refusal — it says it cannot act", () => {
    for (const text of [
      "Je ne peux pas accéder à vos emails.",
      "Je ne suis pas en mesure de faire cela.",
      "Je n'ai pas accès à votre agenda.",
      "Malheureusement, cette information m'échappe.",
      "I can't access your inbox.",
      "Unfortunately I am unable to do that.",
    ]) {
      it(`catches: ${text.slice(0, 44)}`, () => expect(looksLikeRefusal(text)).toBe(true));
    }
  });

  describe("pseudo-appel TEXTUEL — la SYNTAXE d'un tool call imprimée au lieu d'être émise", () => {
    // Measured in a real eval on Gemma :free — the final answer WAS the syntax.
    for (const text of [
      '<|tool_call>call:browser_navigate{url:<|"|>https://html.duckduckgo.com/html/?q=x<|"|>}<tool_call|>',
      'call:web_fetch_many{"urls":["https://a.fr"]}',
      "[TOOL_CALL] run_python(code=...)",
      "<tool_call>{\"name\":\"run_python\"}</tool_call>",
    ]) {
      it(`catches: ${text.slice(0, 44)}`, () => expect(looksLikeRefusal(text)).toBe(true));
    }
    it("does NOT fire on prose about calling someone", () => {
      expect(looksLikeRefusal("Bonne idée : appelle le client demain matin, c'est le plus simple.")).toBe(false);
    });
  });

  describe("plan-leak — it NAMES a namespaced tool in prose instead of calling it", () => {
    for (const text of [
      'We need to find the contract. Use google-drive__search_files with query "contrat".',
      "Je vais utiliser gmail__send_email pour envoyer le résumé.",
      "Étapes : 1) linear__list_issues 2) asana__asana_create_task.",
    ]) {
      it(`catches: ${text.slice(0, 44)}`, () => expect(looksLikeRefusal(text)).toBe(true));
    }
    it("does NOT fire on ordinary prose with underscores absent", () => {
      expect(looksLikeRefusal("Le contrat dure 24 mois, montant 48 000 € HT.")).toBe(false);
    });
  });

  describe("deferral — it promises to act but called nothing", () => {
    for (const text of [
      "Je vais consulter vos emails tout de suite.",
      "Laissez-moi vérifier cela.",
      "Un instant, je regarde.",
      "Let me check your calendar.",
      "I'll pull up the data.",
    ]) {
      it(`catches: ${text.slice(0, 44)}`, () => expect(looksLikeRefusal(text)).toBe(true));
    }
  });

  describe("connect-prose — it narrates the integration cards instead of calling the tool", () => {
    // The exact reply that shipped with NO cards: DeepSeek V4 Flash (free tier,
    // Zen) recited the `suggestGuidance` catalog and asked which tool the user uses,
    // rather than calling `suggest_integrations`. It matched neither the refusal nor
    // the deferral branch, so the forced retry never fired. This is the regression.
    const REAL_REPLY = `Bonjour ! Pour chercher vos tickets ouverts, j'aurais besoin de savoir quel outil de gestion de tickets vous utilisez. Je vois plusieurs possibilités :

Linear (issues, projects)
Jira / Confluence (Atlassian)
GitHub Issues
Asana (tasks)
Monday.com
Close (CRM)
Intercom (tickets support)

Aucune de ces intégrations n'est encore connectée. Pouvez-vous me dire lequel vous utilisez ? Je pourrai alors vous aider à le connecter, ou si vous le souhaitez je vous propose les intégrations correspondantes pour vous connecter en un clic.`;

    it("catches the real DeepSeek V4 Flash reply that shipped without cards", () => {
      expect(looksLikeRefusal(REAL_REPLY)).toBe(true);
    });

    for (const text of [
      "Aucune de ces intégrations n'est encore connectée.",
      "Le connecteur Linear n'est pas connecté.",
      "Quel outil de gestion de tickets utilisez-vous ?",
      "Which tool do you use for issues?",
      "Vous pouvez le connecter en un clic.",
      "Gmail is not yet connected.",
    ]) {
      it(`catches: ${text.slice(0, 44)}`, () => expect(looksLikeRefusal(text)).toBe(true));
    }
  });

  describe("multilingual — deferral / inability / connect-prose beyond FR+EN", () => {
    for (const text of [
      // Deferral
      "Déjame revisar tu bandeja de entrada.", // ES
      "Voy a comprobar tu calendario.", // ES
      "Einen Moment, ich schaue nach.", // DE
      "Lass mich das kurz prüfen.", // DE
      "Fammi controllare i tuoi messaggi.", // IT
      "Un attimo, verifico subito.", // IT
      "Deixe-me verificar seus e-mails.", // PT
      "Vou procurar essa informação.", // PT
      "Laat me even kijken in je agenda.", // NL
      // Inability
      "No puedo acceder a tu correo.", // ES
      "Lamentablemente no tengo acceso.", // ES
      "Ich kann das leider nicht.", // DE
      "Non posso accedere ai tuoi dati.", // IT
      "Infelizmente, não tenho acesso.", // PT
      "Ik kan dat niet doen.", // NL
      // Connect-prose
      "Ninguna de estas integraciones está conectada.", // ES
      "Gmail ist nicht verbunden.", // DE
      "Nessuna integrazione è connessa.", // IT
      "Nenhuma dessas integrações está conectada.", // PT
    ]) {
      it(`catches: ${text.slice(0, 44)}`, () => expect(looksLikeRefusal(text)).toBe(true));
    }
  });

  describe("does NOT trip on a generated document / code body", () => {
    // THE regression: the model wrote a thank-you email inside a ```document block.
    // Its body — "prendre un moment pour te remercier" — matched the deferral
    // branch and fired an unwanted forced-tool retry, which 400'd on a provider
    // that rejects tool_choice=required and turned the delivered email red. A
    // ```document / ```code body is content the model was ASKED to produce; it must
    // never be read as the assistant's own deferral, in ANY language.
    const EMAIL_REPLY = `Voici un email de remerciement que tu peux envoyer à Noah :

\`\`\`document
# Objet : Merci 🙏

Bonjour Noah,

Je souhaitais prendre un moment pour te remercier chaleureusement pour ta collaboration.

Au plaisir de continuer à travailler ensemble.

Bien cordialement,
\`\`\`

Tu peux bien sûr personnaliser le contenu selon le contexte.`;
    it("ignores a thank-you email whose body says « prendre un moment »", () => {
      expect(looksLikeRefusal(EMAIL_REPLY)).toBe(false);
    });

    // A code block whose comment says "let me check" must not count either.
    const CODE_REPLY = "Voici le script :\n\n```python\n# let me check the value\nprint(x)\n```\n\nIl affiche la valeur de x.";
    it("ignores a deferral phrase inside a fenced code block", () => {
      expect(looksLikeRefusal(CODE_REPLY)).toBe(false);
    });
  });

  describe("does NOT trip on a genuine conversational answer", () => {
    // A forced tool call on any of these would hijack a correct reply.
    for (const text of [
      "Voici le résumé que vous avez demandé : la réunion portait sur le budget.",
      "La capitale de la France est Paris.",
      "Bonjour ! Comment puis-je vous aider aujourd'hui ?",
      "J'ai bien reçu vos trois tickets ouverts et les voici classés par priorité.",
      "Le code ci-dessus trie la liste par date décroissante.",
      "Préférez-vous un ton formel ou informel pour cette lettre ?",
      "Voulez-vous que je développe ce point ?",
      "Here is the report you asked for, broken down by quarter.",
    ]) {
      it(`ignores: ${text.slice(0, 44)}`, () => expect(looksLikeRefusal(text)).toBe(false));
    }
  });
});

describe("namesConnectedConnector — la réponse fabriquée sans outil (l'autre porte de la relance forcée)", () => {
  it("mord quand la demande nomme un connecteur connecté, mot entier, apostrophe comprise", () => {
    expect(namesConnectedConnector("quels sont les utilisateurs d'intercom ?", ["intercom"])).toBe(true);
    expect(namesConnectedConnector("liste mes emails Gmail", ["gmail"])).toBe(true);
  });

  it("mot ENTIER seulement — un id enchâssé dans un autre mot ne mord pas", () => {
    expect(namesConnectedConnector("parle-moi de l'intercommunalité", ["intercom"])).toBe(false);
    // …but the same request with the word isolated further on DOES bite (the scan continues).
    expect(namesConnectedConnector("l'intercommunalité, puis intercom", ["intercom"])).toBe(true);
  });

  it("un id composé ne matche que tel quel — aide au rappel, pas porte de correction", () => {
    expect(namesConnectedConnector("ouvre google-calendar", ["google-calendar"])).toBe(true);
    expect(namesConnectedConnector("ouvre google calendar", ["google-calendar"])).toBe(false);
  });

  it("texte vide, id vide, aucun connecteur ⇒ jamais", () => {
    expect(namesConnectedConnector("", ["intercom"])).toBe(false);
    expect(namesConnectedConnector("bonjour", [])).toBe(false);
    expect(namesConnectedConnector("bonjour", [""])).toBe(false);
  });
});

describe("isBrowserBackendFault", () => {
  describe("catches a deterministic agent-browser CDP capability fault", () => {
    for (const text of [
      "browserBackend.callTool: Protocol error (Target.createTarget): Not supported",
      "### Error\nError: browserBackend.callTool: Protocol error (Target.createTarget): Not supported",
      "Protocol error (Target.createTarget): Not supported",
      "Tool error: Protocol error (Target.createTarget): Not supported",
    ]) {
      it(`catches: ${text.slice(0, 44)}`, () => expect(isBrowserBackendFault(text)).toBe(true));
    }
  });

  describe("does NOT catch ordinary failures (website / transient / self-healing)", () => {
    for (const text of [
      // A website-level failure — the model should try another site, not stop.
      "net::ERR_NAME_NOT_RESOLVED at https://www.lemonde.fr",
      "Timeout 30000ms exceeded while waiting for load state",
      // The stale-endpoint case that self-heals via ensureBrowserConnLive — must
      // NOT be treated as a fatal capability fault.
      "Target page, context or browser has been closed",
      "Navigation blocked by policy",
      "This action is not supported on this website",
    ]) {
      it(`ignores: ${text.slice(0, 44)}`, () => expect(isBrowserBackendFault(text)).toBe(false));
    }
  });
});

describe("webToolPhrase — la guidance ne nomme que les outils web OFFERTS", () => {
  it("navigateur + web_fetch_many → les deux nommés", () => {
    const p = webToolPhrase(true, true);
    expect(p).toContain("browser_navigate");
    expect(p).toContain("web_fetch_many");
  });
  it("web_fetch_many seul → le navigateur n'apparaît PAS (Gemma imitait un browser_navigate textuel)", () => {
    const p = webToolPhrase(false, true);
    expect(p).not.toContain("browser_navigate");
    expect(p).toContain("web_fetch_many");
  });
  it("aucun outil web → consigne explicite de ne pas inventer d'appel", () => {
    const p = webToolPhrase(false, false);
    expect(p).not.toContain("browser_navigate");
    expect(p).toMatch(/n'invente pas/);
  });
});

describe("pythonErrorHint — l'indice réseau ne nomme que les outils web offerts", () => {
  const NET = "requests.exceptions.ConnectionError: Max retries exceeded";
  it("défaut (app) : les deux outils", () => {
    expect(pythonErrorHint(NET)).toContain("browser_navigate");
  });
  it("sans navigateur : web_fetch_many seulement", () => {
    const h = pythonErrorHint(NET, { browser: false, fetchMany: true });
    expect(h).not.toContain("browser_navigate");
    expect(h).toContain("web_fetch_many");
  });
});
