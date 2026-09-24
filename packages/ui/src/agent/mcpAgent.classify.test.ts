
import { describe, expect, it, } from "vitest";
import { isWriteTool, isConfidentReadOnly, classifyToolError, isSearchTool, looksWebIntent, } from "./mcpAgent";
import { isCommSendTool, isDraftOnlyIntent } from "./mcpAgentClassify";

describe("looksWebIntent", () => {
  it("fires on current-events / recency / explicit-browse requests (FR + EN)", () => {
    for (const q of [
      "Quelle actualité en France aujourd'hui ?",
      "les dernières news sur le sujet",
      "quel temps fait-il, la météo maintenant",
      "what's the latest on the election",
      "who is the current CEO of that firm",
      "cherche sur le web le prix du billet",
      "va sur le site officiel et lis la page",
      "les résultats en direct du match",
      "le classement 2026 des universités",
    ]) {
      expect(looksWebIntent(q)).toBe(true);
    }
  });

  it("does NOT fire on a self-contained task (no web needed)", () => {
    for (const q of [
      "Écris-moi un poème sur l'automne",
      "calcule la moyenne de ces nombres",
      "traduis ce paragraphe en anglais",
      "explique-moi la récursivité",
      "résume ce texte",
    ]) {
      expect(looksWebIntent(q)).toBe(false);
    }
  });

  it("is empty-safe", () => {
    expect(looksWebIntent("")).toBe(false);
  });
});

describe("isSearchTool", () => {
  it("flags web-search/crawl connectors (their page images must NOT be auto-saved)", () => {
    expect(isSearchTool("firecrawl__firecrawl_scrape")).toBe(true);
    expect(isSearchTool("exa__search")).toBe(true);
    expect(isSearchTool("tavily__extract")).toBe(true);
  });
  it("does NOT flag export-capable connectors (Canva etc. still download)", () => {
    expect(isSearchTool("canva__export_design")).toBe(false);
    expect(isSearchTool("gmail__send_email")).toBe(false);
    expect(isSearchTool("stripe__stripe_api_read")).toBe(false);
  });
  it("flags the integrated browser AND a third-party browser (BrowserMCP) — fires the reveal gate", () => {
    expect(isSearchTool("browser__browser_navigate")).toBe(true);
    // The reported bug: a third-party browser connector's navigation must also fire it.
    expect(isSearchTool("browsermcp__browser_navigate")).toBe(true);
  });
});

describe("classifyToolError — bilingual", () => {
  it("classifies FRENCH arg errors (our connectors emit these) as arg_error", () => {
    for (const m of [
      "Le champ `to` (adresse email du destinataire) est OBLIGATOIRE et manquant.",
      "`to` (destinataire) est requis.",
      "Les champs `subject` (objet) et `body` (corps) sont obligatoires.",
      "Valeur invalide pour le paramètre.",
      "Le champ ne doit pas être vide.",
    ]) {
      expect(classifyToolError(m)).toBe("arg_error");
    }
  });
  it("classifies FRENCH operational errors as operational (not arg)", () => {
    for (const m of [
      "Accès refusé (403).",
      "« API Gmail » n'est pas activée sur votre projet Google Cloud.",
      "Jeton Google expiré ou invalide — reconnectez le connecteur.",
      "l'autorisation nécessaire n'a pas été accordée",
    ]) {
      expect(classifyToolError(m)).toBe("operational");
    }
  });
  it("still classifies the English variants", () => {
    expect(classifyToolError("Missing required parameter: to")).toBe("arg_error");
    expect(classifyToolError("403 Forbidden: insufficient permission")).toBe("operational");
    expect(classifyToolError("fetch failed: ECONNREFUSED")).toBe("transport");
  });
});

describe("isWriteTool", () => {
  it("flags mutating tools", () => {
    for (const n of [
      "stripe__stripe_api_write",
      "stripe__create_refund",
      "gmail__send_message",
      "linear__update_issue",
      "fs__delete_file",
      "webflow__publish_site",
    ]) {
      expect(isWriteTool(n)).toBe(true);
    }
  });
  it("does not flag read-only tools", () => {
    for (const n of [
      "stripe__search_stripe_resources",
      "stripe__stripe_api_read",
      "stripe__stripe_api_details",
      "gmail__list_messages",
      "linear__get_issue",
      "fs__read_file",
    ]) {
      expect(isWriteTool(n)).toBe(false);
    }
  });
  it("falls back to the description for a generic name", () => {
    expect(isWriteTool("stripe__api", "Create or update a resource")).toBe(true);
    expect(isWriteTool("stripe__api", "Retrieve a resource")).toBe(false);
  });
  it("server annotations may only RAISE suspicion, never lower it (H-5)", () => {
    // destructiveHint / readOnlyHint:false always force a confirm.
    expect(isWriteTool("x__get_thing", undefined, { readOnlyHint: false })).toBe(true);
    expect(isWriteTool("x__get_thing", undefined, { destructiveHint: true })).toBe(true);
    // A WRITE-verb name still confirms even if a (malicious) server marks it read-only —
    // a server can't spoof `readOnlyHint:true` to bypass the gate on `update_*`.
    expect(isWriteTool("x__update_thing", undefined, { readOnlyHint: true })).toBe(true);
    // readOnlyHint:true is only a tie-breaker for a GENERIC name (no read/write verb).
    expect(isWriteTool("x__thing", undefined, { readOnlyHint: true })).toBe(false);
    // Annotations present but silent on read/write → heuristic still decides.
    expect(isWriteTool("x__delete_thing", undefined, {})).toBe(true);
  });
  it("flags the destructive verbs the gate used to MISS (write-confirm bypass fix)", () => {
    for (const n of [
      "supabase__execute_sql",
      "supabase__apply_migration",
      "github__merge_pull_request",
      "db__run_query",
      "k8s__apply_manifest",
      "sql__drop_table",
      "sql__truncate_table",
      "infra__provision_cluster",
      "infra__terminate_instance",
      "db__restore_backup",
      "iam__grant_role",
    ]) {
      expect(isWriteTool(n)).toBe(true);
    }
  });
  it("a destructive verb behind a READ prefix still confirms (H-5 compound-name bypass)", () => {
    for (const n of [
      "crm__get_and_purge",
      "data__list_then_delete",
      "acct__fetch_and_wipe",
      "vault__read_and_revoke",
      "billing__get_and_refund",
    ]) {
      expect(isWriteTool(n)).toBe(true);
    }
    // The soft-noun collisions stay read-only (no over-prompting): a write-NOUN behind a
    // read prefix is still read (get_issue / get_run / list_posts).
    expect(isWriteTool("linear__get_issue")).toBe(false);
    expect(isWriteTool("ci__get_run")).toBe(false);
    expect(isWriteTool("blog__list_posts")).toBe(false);
  });
  it("a conjunction-joined compound write confirms behind a read prefix (H-5 second pass)", () => {
    for (const n of [
      "mail__get_and_send_email",
      "billing__list_then_charge",
      "crm__fetch_and_create",
      "bank__search_and_transfer",
      "cms__get_and_publish",
    ]) {
      expect(isWriteTool(n), n).toBe(true);
    }
    // A read verb + conjunction + a NOUN (not a write verb) stays read — no over-prompt.
    expect(isWriteTool("crm__get_customer_and_orders")).toBe(false);
    expect(isWriteTool("db__list_users_and_teams")).toBe(false);
  });
});

describe("isConfidentReadOnly (prefetch eligibility)", () => {
  it("requires a positive read-verb NAME — a bare readOnlyHint is not enough (H-5)", () => {
    expect(isConfidentReadOnly("gmail__list_messages")).toBe(true);
    expect(isConfidentReadOnly("stripe__search_stripe_resources")).toBe(true);
    // A generic name the server merely CLAIMS is read-only must NOT be eagerly
    // pre-executed before the write gate — a spoofed hint would pre-run a mutation.
    expect(isConfidentReadOnly("x__anything", { annotations: { readOnlyHint: true } })).toBe(false);
    // A read-verb name with readOnlyHint is still eligible.
    expect(isConfidentReadOnly("x__get_thing", { annotations: { readOnlyHint: true } })).toBe(true);
  });
  it("is FALSE for a mis-classifiable mutation, so it is never eagerly prefetched", () => {
    // The dangerous case: an unknown-intent tool that is actually a mutation.
    expect(isConfidentReadOnly("supabase__execute_sql")).toBe(false);
    expect(isConfidentReadOnly("supabase__apply_migration")).toBe(false);
    expect(isConfidentReadOnly("github__merge_pull_request")).toBe(false);
    // A bare noun tool (no verb) is also not confidently read-only.
    expect(isConfidentReadOnly("crm__customers")).toBe(false);
    // Meta-tools are not read-verbs → not prefetched (handled sequentially in the loop).
    expect(isConfidentReadOnly("run_python")).toBe(false);
    expect(isConfidentReadOnly("load_tools")).toBe(false);
    expect(isConfidentReadOnly("suggest_integrations")).toBe(false);
  });
  it("a destructiveHint / readOnlyHint:false overrides a read-verb name", () => {
    expect(isConfidentReadOnly("x__get_thing", { annotations: { destructiveHint: true } })).toBe(false);
    expect(isConfidentReadOnly("x__get_thing", { annotations: { readOnlyHint: false } })).toBe(false);
    // A destructive verb behind a read prefix is NOT prefetched (H-5).
    expect(isConfidentReadOnly("crm__get_and_purge")).toBe(false);
    expect(isConfidentReadOnly("data__fetch_and_delete")).toBe(false);
    // A conjunction-joined compound write is NOT prefetched either (H-5 second pass).
    expect(isConfidentReadOnly("mail__get_and_send_email")).toBe(false);
    expect(isConfidentReadOnly("billing__list_then_charge")).toBe(false);
    // ...but a read verb + conjunction + noun stays prefetchable (no over-restriction).
    expect(isConfidentReadOnly("crm__get_customer_and_orders")).toBe(true);
  });
});

describe("« rédiger » ≠ « envoyer » — intent + send-class classifiers", () => {
  it("classifies send-class communication tools by verb prefix, never a drafting tool", () => {
    for (const t of ["send_email", "send_message", "reply_to_thread", "post_message"]) {
      expect(isCommSendTool(t)).toBe(true);
    }
    for (const t of ["create_draft", "draft_email", "get_message", "write_file"]) {
      expect(isCommSendTool(t)).toBe(false);
    }
  });
  it("une demande de RÉDACTION sans verbe d'envoi = brouillon seulement (le scénario du journal)", () => {
    for (const q of [
      "Rédige un email de remerciement à nathan@hotmail.fr.", // journal 2026-07-26
      "Écris un message de relance pour le client",
      "prépare une réponse à ce mail",
      "rédiger un courrier de résiliation",
    ]) {
      expect(isDraftOnlyIntent(q)).toBe(true);
    }
  });
  it("un verbe d'ENVOI explicite rouvre la porte (envoie / rédige et envoie / envoie-le / réponds-lui)", () => {
    for (const q of [
      "Envoie un email de remerciement à nathan@hotmail.fr.",
      "Rédige et envoie un email de remerciement à Nathan",
      "parfait, envoie-le",
      "réponds-lui que c'est d'accord",
      "transmets ce message à l'équipe",
    ]) {
      expect(isDraftOnlyIntent(q)).toBe(false);
    }
  });
  it("ne se déclenche pas hors communication (rédiger un rapport n'est pas un envoi)", () => {
    expect(isDraftOnlyIntent("Rédige un rapport sur les ventes")).toBe(false);
    expect(isDraftOnlyIntent("calcule la moyenne")).toBe(false);
    expect(isDraftOnlyIntent("")).toBe(false);
  });
});
