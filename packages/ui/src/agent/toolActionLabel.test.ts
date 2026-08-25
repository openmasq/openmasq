import { describe, it, expect } from "vitest";
import { toolActionLabel, toolStartNarration } from "./toolActionLabel";

describe("toolActionLabel", () => {
  it("names the built-in interpreter + shows the live char-count", () => {
    expect(toolActionLabel("run_python", 1240)).toBe("Analyse et génération de fichiers… (1240 car.)");
    expect(toolActionLabel("run_python", 0)).toBe("Analyse et génération de fichiers…");
  });

  // ⚠️ Les exemples sont des LECTURES à dessein. Ils étaient des écritures
  // (`send_email`, `create_issue`, `send_message`) et figeaient le défaut : la phrase
  // de lecture s'affichait pendant un envoi. `toolLabelParity.test.ts` tient l'autre
  // moitié — qu'une écriture ne puisse plus jamais l'emprunter.
  it("gives well-known connectors a fun, contextual verb (on a READ)", () => {
    expect(toolActionLabel("gmail__search_messages", 80)).toBe("Fouille de la boîte mail… (80 car.)");
    expect(toolActionLabel("linear__list_issues")).toBe("Tri des tickets Linear…");
    expect(toolActionLabel("slack__slack_read_channel")).toBe("Aux aguets sur Slack…");
  });

  it("labels the browser by the actual gesture (search vs navigate vs read)", () => {
    expect(toolActionLabel("browser__browser_navigate")).toBe("Exploration de la toile…");
    expect(toolActionLabel("browser__browser_search")).toBe("Recherche sur la toile…");
    expect(toolActionLabel("browser__browser_take_screenshot")).toBe("Lecture de la page…");
    expect(toolActionLabel("browser__browser_tabs")).toBe("Jonglage entre les onglets…");
  });

  it("normalises a multi-account instance id before lookup", () => {
    expect(toolActionLabel("gmail--a1b2__search_messages")).toBe("Fouille de la boîte mail…");
  });

  it("handles the meta tools + an unknown connector + a bare tool name", () => {
    expect(toolActionLabel("load_tools", 40)).toBe("Choix des outils… (40 car.)");
    expect(toolActionLabel("suggest_integrations")).toBe("Recherche d'une intégration…");
    expect(toolActionLabel("web_fetch_many")).toBe("Lecture de pages web…");
    expect(toolActionLabel("memory_search")).toBe("Recherche dans la mémoire…");
    expect(toolActionLabel("write_file", 999)).toBe("Mise à jour · fichier… (999 car.)");
  });

  it("NEVER prints a raw tool name for a connector with no sentence of its own", () => {
    // 20 of the catalogue's 57 connectors have one, so this path is the common case —
    // and it used to read « Vercel · get deployment… », the developer name with spaces.
    expect(toolActionLabel("vercel__get_deployment")).toBe("Lecture · deployment (Vercel)…");
    expect(toolActionLabel("posthog__exec", 30)).toBe("Exécution (PostHog)… (30 car.)");
    expect(toolActionLabel("supabase__list_tables")).toBe("Lecture · tables (Supabase)…");
  });

  it("falls back gracefully when the name isn't known yet", () => {
    expect(toolActionLabel(undefined, 200)).toBe("Rédaction… (200 car.)");
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

  it("reuses the playful connector vocabulary, multi-account normalised", () => {
    expect(toolStartNarration("search_messages", "gmail--a1b2")).toBe("Fouille de la boîte mail");
    expect(toolStartNarration("run_python", "python")).toBe("Analyse et génération de fichiers");
  });

  it("names the ACTION for an unknown connector (never raw args, never a fake value)", () => {
    // It used to name the connector — which the trace card above the row already does —
    // and say nothing about the call: « Lecture · acme » for every read tool it ever made.
    expect(toolStartNarration("list_widgets", "acme")).toBe("Lecture · widgets");
    expect(toolStartNarration("do_thing", "acme")).toBe("do thing");
  });
});
