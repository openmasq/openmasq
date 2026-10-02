import { describe, it, expect } from "vitest";
import { getMessages } from "@openmasq/i18n";
import { toolActionLabel as action, toolStartNarration as start } from "./toolActionLabel";

const fr = getMessages("fr");
const en = getMessages("en");
const toolActionLabel = (name?: string, chars?: number) => action(fr, name, chars);
const toolStartNarration = (tool: string, connector: string, host?: string) => start(tool, connector, fr, host);

describe("toolActionLabel", () => {
  it("names the built-in interpreter + shows the live char-count", () => {
    expect(toolActionLabel("run_python", 1240)).toBe("Analyse et génération de fichiers… (1240 caractères)");
    expect(toolActionLabel("run_python", 0)).toBe("Analyse et génération de fichiers…");
  });

  // ⚠️ The examples are READS on purpose. They used to be writes
  // (`send_email`, `create_issue`, `send_message`) and froze in the bug: the read
  // phrase showed while a send was in flight. `toolLabelParity.test.ts` holds the other
  // half — that a write can never borrow it again.
  it("gives well-known connectors a plain, contextual phrase (on a READ)", () => {
    expect(toolActionLabel("gmail__search_messages", 80)).toBe("Recherche dans les e-mails… (80 caractères)");
    expect(toolActionLabel("linear__list_issues")).toBe("Lecture des tickets Linear…");
    expect(toolActionLabel("slack__slack_read_channel")).toBe("Lecture de Slack…");
  });

  it("labels the browser by the actual gesture (search vs navigate vs read)", () => {
    expect(toolActionLabel("browser__browser_navigate")).toBe("Navigation web…");
    expect(toolActionLabel("browser__browser_search")).toBe("Recherche sur le web…");
    expect(toolActionLabel("browser__browser_take_screenshot")).toBe("Lecture de la page…");
    expect(toolActionLabel("browser__browser_tabs")).toBe("Gestion des onglets…");
  });

  it("normalises a multi-account instance id before lookup", () => {
    expect(toolActionLabel("gmail--a1b2__search_messages")).toBe("Recherche dans les e-mails…");
  });

  it("handles the meta tools + an unknown connector + a bare tool name", () => {
    expect(toolActionLabel("load_tools", 40)).toBe("Choix des outils… (40 caractères)");
    expect(toolActionLabel("suggest_integrations")).toBe("Recherche d'un connecteur…");
    expect(toolActionLabel("web_fetch_many")).toBe("Lecture de pages web…");
    expect(toolActionLabel("memory_search")).toBe("Recherche dans la mémoire…");
    expect(toolActionLabel("write_file", 999)).toBe("Mise à jour · fichier… (999 caractères)");
  });

  it("NEVER prints a raw tool name for a connector with no sentence of its own", () => {
    // 20 of the catalogue's 57 connectors have one, so this path is the common case —
    // and it used to read « Vercel · get deployment… », the developer name with spaces.
    expect(toolActionLabel("vercel__get_deployment")).toBe("Lecture · deployment (Vercel)…");
    expect(toolActionLabel("posthog__exec", 30)).toBe("Exécution (PostHog)… (30 caractères)");
    expect(toolActionLabel("supabase__list_tables")).toBe("Lecture · tables (Supabase)…");
  });

  it("falls back gracefully when the name isn't known yet", () => {
    expect(toolActionLabel(undefined, 200)).toBe("Écriture… (200 caractères)");
    expect(toolActionLabel(undefined, 0)).toBeUndefined();
    expect(toolActionLabel()).toBeUndefined();
  });
});

describe("toolStartNarration", () => {
  it("names the REAL host the browser is opening (never « en cours… »)", () => {
    // The reported UX gap: the live row sat on a bare spinner while the LLM
    // narration was still generating. The seed must say the action instantly.
    expect(toolStartNarration("browser_navigate", "browser", "www.google.com")).toBe(
      "Ouverture de www.google.com",
    );
    expect(toolStartNarration("browser_tabs", "browser", "acme.fr")).toBe("Ouverture de acme.fr");
  });

  it("falls back to the gesture when no host is known", () => {
    expect(toolStartNarration("browser_navigate", "browser")).toBe("Navigation web");
    expect(toolStartNarration("browser_search", "browser")).toBe("Recherche sur le web");
    expect(toolStartNarration("browser_snapshot", "browser")).toBe("Lecture de la page");
  });

  it("reuses the connector vocabulary, multi-account normalised", () => {
    expect(toolStartNarration("search_messages", "gmail--a1b2")).toBe("Recherche dans les e-mails");
    expect(toolStartNarration("run_python", "python")).toBe("Analyse et génération de fichiers");
  });

  it("names the ACTION for an unknown connector (never raw args, never a fake value)", () => {
    // It used to name the connector — which the trace card above the row already does —
    // and say nothing about the call: « Lecture · acme » for every read tool it ever made.
    expect(toolStartNarration("list_widgets", "acme")).toBe("Lecture · widgets");
    expect(toolStartNarration("do_thing", "acme")).toBe("do thing");
  });
});

describe("the live line in English", () => {
  it("is sober and counts characters in words", () => {
    expect(action(en, "gmail__search_messages")).toBe("Searching email…");
    expect(action(en, "google-calendar__list_events")).toBe("Checking calendar…");
    expect(action(en, "slack__slack_read_channel")).toBe("Reading Slack…");
    expect(action(en, undefined, 123)).toBe("Writing… (123 characters)");
    expect(action(en, undefined, 1)).toBe("Writing… (1 character)");
    expect(action(en, "vercel__get_deployment")).toBe("Read · deployment (Vercel)…");
    expect(start("browser_navigate", "browser", en, "acme.com")).toBe("Opening acme.com");
  });
});
