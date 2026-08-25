import { describe, expect, it } from "vitest";
import { classifyToolWrite, isAmbiguousWrite, DESTRUCTIVE_VERB, READ_VERB } from "./writeVocabulary";

// LE classifieur écriture partagé (règle 9) : le write-gate de main
// (`apps/desktop/.../writeGate.ts` `isWriteToolName`) et la boucle du renderer
// (`@openmasq/ui` `isWriteTool`) appellent tous deux CETTE fonction. Les cas
// ci-dessous épinglent le contrat que les deux frontières avaient laissé dériver.

describe("classifyToolWrite — fail closed : inconnu ⇒ ÉCRITURE", () => {
  it("un nom GÉNÉRIQUE (ni verbe de lecture ni d'écriture) se confirme", () => {
    // Les trois noms de l'audit : aucun verbe, un effet inconnu — donc une écriture,
    // des DEUX côtés de la frontière (l'UI répondait « lecture » ici : fail open).
    for (const n of ["notion__notion-duplicate-page", "linear__issue", "stripe__customers"]) {
      expect(classifyToolWrite(n), n).toBe(true);
    }
    expect(classifyToolWrite("acme__frobnicate")).toBe(true);
  });

  it("le départage d'un nom générique : readOnlyHint:true, ou une description de lecture", () => {
    expect(classifyToolWrite("acme__frobnicate", { readOnlyHint: true })).toBe(false);
    expect(classifyToolWrite("stripe__api", undefined, "Retrieve a resource")).toBe(false);
    expect(classifyToolWrite("stripe__api", undefined, "Create or update a resource")).toBe(true);
    // Une description ambiguë ne départage rien : fail closed.
    expect(classifyToolWrite("stripe__api", undefined, "Stripe API")).toBe(true);
  });
});

describe("classifyToolWrite — les lectures ne sur-confirment pas", () => {
  it("tête de lecture ⇒ lecture (y compris les noms-objets d'écriture : get_issue)", () => {
    for (const n of [
      "gmail__list_messages",
      "stripe__search_customers",
      "linear__get_issue",
      "ci__get_run",
      "blog__list_posts",
      "fs__read_file",
    ]) {
      expect(classifyToolWrite(n), n).toBe(false);
    }
  });

  it("verbe de lecture derrière un préfixe vendeur, ZÉRO preuve d'écriture ⇒ lecture", () => {
    // Le cas qui rendrait le défaut fail-closed invivable sans ce palier : Stripe et
    // Notion répètent leur nom devant le verbe.
    for (const n of ["stripe__stripe_api_read", "stripe__stripe_api_details", "notion__notion-fetch"]) {
      expect(classifyToolWrite(n), n).toBe(false);
    }
  });
});

describe("classifyToolWrite — les contournements fermés (H-5)", () => {
  it("un verbe destructeur N'IMPORTE OÙ l'emporte sur la tête de lecture", () => {
    for (const n of [
      "crm__get_and_purge",
      "data__list_then_delete",
      "acct__fetch_and_wipe",
      // L'ancre `^` de READ_VERB est ce qui empêche « read » au MILIEU du nom de
      // blanchir le delete en tête.
      "mail__delete_read_receipts",
    ]) {
      expect(classifyToolWrite(n), n).toBe(true);
    }
  });

  it("une commande composée (lecture + conjonction + écriture) se confirme", () => {
    for (const n of ["mail__get_and_send_email", "billing__list_then_charge", "crm__fetch_and_create"]) {
      expect(classifyToolWrite(n), n).toBe(true);
    }
    // Lecture + conjonction + NOM (pas un verbe d'écriture) reste une lecture.
    expect(classifyToolWrite("crm__get_customer_and_orders")).toBe(false);
  });

  it("une annotation serveur AUGMENTE le soupçon, ne le baisse jamais", () => {
    expect(classifyToolWrite("acme__get_report", { destructiveHint: true })).toBe(true);
    expect(classifyToolWrite("acme__list_things", { readOnlyHint: false })).toBe(true);
    // readOnlyHint:true ne blanchit JAMAIS un nom d'écriture.
    expect(classifyToolWrite("gmail__send_email", { readOnlyHint: true })).toBe(true);
  });

  it("les verbes que les DEUX anciennes listes se partageaient mal (l'union)", () => {
    // main seul connaissait upload/replace/invite/share ; l'UI seule destroy/upsert/void.
    for (const n of [
      "drive__upload_file",
      "cfg__replace_settings",
      "org__invite_member",
      "doc__share_document",
      "db__destroy_index",
      "db__upsert_row",
      "pay__void_invoice",
    ]) {
      expect(classifyToolWrite(n), n).toBe(true);
    }
  });
});

describe("isAmbiguousWrite — « execute » n'est pas une preuve de mutation", () => {
  const RO = { readOnlyHint: true };

  it("le cas du journal : execute-sql déclaré lecture seule", () => {
    // Il RESTE une écriture (donc confirmé) — c'est le refus AUTOMATIQUE qu'on lève.
    expect(classifyToolWrite("posthog__execute-sql", RO)).toBe(true);
    expect(isAmbiguousWrite("posthog__execute-sql", RO)).toBe(true);
    for (const n of ["db__run_query", "bi__run-report", "wh__execute_query"])
      expect(isAmbiguousWrite(n, RO), n).toBe(true);
  });

  it("SANS la déclaration du serveur, rien ne change", () => {
    expect(isAmbiguousWrite("posthog__execute-sql")).toBe(false);
    expect(isAmbiguousWrite("posthog__execute-sql", { readOnlyHint: false })).toBe(false);
    expect(isAmbiguousWrite("posthog__execute-sql", { readOnlyHint: true, destructiveHint: true })).toBe(false);
  });

  it("un verbe destructeur ou composé ferme la porte, même déclaré lecture seule", () => {
    for (const n of ["db__run_and_delete", "db__execute_drop_table", "db__run_purge"])
      expect(isAmbiguousWrite(n, RO), n).toBe(false);
  });

  it("le verbe ambigu doit être la SEULE cause du verdict", () => {
    // « create » porte le verdict tout seul : retirer « run » ne le fait pas tomber.
    for (const n of ["db__run_create_index", "api__execute_update_user"])
      expect(isAmbiguousWrite(n, RO), n).toBe(false);
  });

  it("une vraie lecture n'est pas concernée (elle n'était déjà pas refusée)", () => {
    for (const n of ["posthog__read-data-schema", "gh__get_issue"])
      expect(isAmbiguousWrite(n, RO), n).toBe(false);
  });

  it("la liste ambiguë reste COURTE — un verbe franc n'y entre pas", () => {
    for (const n of ["mail__send_message", "db__delete_row", "pay__refund_charge"])
      expect(isAmbiguousWrite(n, RO), n).toBe(false);
  });
});

describe("le vocabulaire lui-même", () => {
  it("READ_VERB est ancré en tête — la seule position de confiance", () => {
    expect(READ_VERB.source.startsWith("^")).toBe(true);
  });
  it("chaque verbe destructeur pris isolément classe écriture (aucun trou d'ancrage)", () => {
    for (const v of DESTRUCTIVE_VERB.source.replace(/^\\b\(|\)\\b$/g, "").split("|")) {
      expect(classifyToolWrite(`srv__${v}_thing`), v).toBe(true);
    }
  });
});
