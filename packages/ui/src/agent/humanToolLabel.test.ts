import { describe, it, expect } from "vitest";
import { humanToolLabel } from "./humanToolLabel";

describe("humanToolLabel", () => {
  it("names the browser's gestures in user language (the reported « browser_navigate »)", () => {
    expect(humanToolLabel("browser", "browser_navigate")).toBe("Ouverture d'une page");
    expect(humanToolLabel("browser", "browser_search")).toBe("Recherche web");
    expect(humanToolLabel("browser", "browser_snapshot")).toBe("Lecture de la page");
    expect(humanToolLabel("browser", "browser_click")).toBe("Action sur la page");
    expect(humanToolLabel("browser", "browser_tabs")).toBe("Gestion des onglets");
  });

  it("finds the verb even when the vendor + its API boilerplate come FIRST", () => {
    // The reported rows: « stripe api search » / « stripe api read » — the developer
    // name with its underscores swapped for spaces, because the verb sat last.
    expect(humanToolLabel("stripe", "stripe_api_search")).toBe("Recherche");
    expect(humanToolLabel("stripe", "stripe_api_read")).toBe("Lecture");
    expect(humanToolLabel("stripe", "stripe_api_write")).toBe("Mise à jour");
  });

  it("drops the connector's own name — the card above the row already says it", () => {
    expect(humanToolLabel("stripe", "search_stripe_documentation")).toBe(
      "Recherche · documentation",
    );
    expect(humanToolLabel("notion", "notion-search")).toBe("Recherche");
    expect(humanToolLabel("google-calendar", "list_calendar_events")).toBe(
      "Lecture · événements",
    );
  });

  it("normalises a multi-account instance id, so its rows read like any other's", () => {
    expect(humanToolLabel("gmail--a1b2c3", "gmail_send_email")).toBe("Envoi · e-mail");
  });

  it("maps a connector tool's verb to an FR action + translates the object", () => {
    expect(humanToolLabel("linear", "list_issues")).toBe("Lecture · tickets");
    expect(humanToolLabel("gmail", "send_email")).toBe("Envoi · e-mail");
    expect(humanToolLabel("linear", "create_issue")).toBe("Création · ticket");
    expect(humanToolLabel("github", "listPullRequests")).toBe("Lecture · pull requests");
  });

  it("says what a verb-less name looks at", () => {
    expect(humanToolLabel("stripe", "stripe_api_details")).toBe("Détails");
    expect(humanToolLabel("figma", "whoami")).toBe("Compte");
  });

  it("lets a DESTRUCTIVE verb outrank a read verb sitting earlier in the name", () => {
    expect(humanToolLabel("acme", "get_and_purge_logs")).toBe("Suppression · logs");
  });

  it("names the app's OWN tools — the generic walk mangled every one of them", () => {
    // Reported on 02/08/2026: "Lecture · many" (the batch marker read as the object),
    // "load" ("tools" is noise everywhere else, so stripped, leaving a bare verb),
    // "Recherche · memory", raw "suggest integrations".
    expect(humanToolLabel("python", "run_python")).toBe("Analyse et génération de fichiers");
    expect(humanToolLabel("web", "web_fetch_many")).toBe("Lecture de pages web");
    expect(humanToolLabel("mcp", "load_tools")).toBe("Choix des outils");
    expect(humanToolLabel("mcp", "suggest_integrations")).toBe("Recherche d'une intégration");
    expect(humanToolLabel("mcp", "memory_search")).toBe("Recherche dans la mémoire");
  });

  it("les nomme quel que soit le serveur sous lequel la trace les a rangés", () => {
    // `web_fetch_many` is registered under "web", `run_python` under "python", and a
    // fallback to "mcp" exists: the tool's name is enough, it's ours.
    expect(humanToolLabel("mcp", "web_fetch_many")).toBe("Lecture de pages web");
    expect(humanToolLabel("", "run_python")).toBe("Analyse et génération de fichiers");
  });

  it("falls back to the cleaned name for an unknown verb (never raw snake_case)", () => {
    expect(humanToolLabel("acme", "frobnicate_all_things")).toBe("frobnicate all things");
    // Everything stripped away → the full name rather than an empty row.
    expect(humanToolLabel("stripe", "stripe_api")).toBe("stripe api");
  });
});
