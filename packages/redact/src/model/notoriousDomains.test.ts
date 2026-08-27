import { describe, expect, it } from "vitest";
import { pseudonymize } from "./pseudonymize";
import { isNotoriousEntity } from "./notorious";
import {
  GENERIC_MAILBOX,
  NOTORIOUS_DOMAINS,
  isNotoriousDomain,
  isNotoriousServiceEmail,
} from "./notoriousDomains";
import { buildFakeEmail } from "./identity";
import { FAKE_EMAIL_DOMAINS } from "./fakes";
import { FIRST_NAMES } from "../engine/names/firstNames.data";
import type { Vault } from "../types";

describe("isNotoriousDomain — la marque en graphie DNS, sous-domaines compris", () => {
  it("matche l'apex ET ses sous-domaines", () => {
    for (const v of [
      "linear.app", "updates.linear.app", "google.com", "accounts.google.com",
      "gmail.com", "send.intercom.com", "github.com", "dropbox.com",
    ]) {
      expect(isNotoriousDomain(v), v).toBe(true);
    }
  });

  it("ne matche NI un domaine inconnu, NI un suffixe usurpé, NI de la prose", () => {
    for (const v of [
      "karlstudio.fr", // le domaine d'une vraie PME reste une donnée
      "linear.app.phish.io", // la notoriété est un SUFFIXE DNS, jamais un préfixe
      "github.io", // apex d'hébergement de contenu UTILISATEUR — jamais dispensé
      "voir linear.app", // prose, pas un domaine nu
      "gmail", // un seul label n'est pas un domaine
    ]) {
      expect(isNotoriousDomain(v), v).toBe(false);
    }
  });
});

describe("isNotoriousServiceEmail — double porte : domaine notoire ET boîte de service", () => {
  const on = { commercial: true };
  it("dispense l'expéditeur transactionnel d'un service notoire (flag commercial)", () => {
    for (const v of [
      "security@updates.linear.app", "no-reply@dropbox.com", "notifications@github.com",
      "noreply-accounts@google.com", "hey@posthog.com", "do.not.reply@stripe.com",
    ]) {
      expect(isNotoriousServiceEmail(v, on), v).toBe(true);
    }
  });

  it("ne dispense JAMAIS une adresse à allure personnelle, un domaine inconnu, ni sans le flag", () => {
    for (const v of [
      "saanika.budhiraja@send.intercom.com", // une employée est une personne, pas la marque
      "jean.dupont@google.com",
      "noreply@karlstudio.fr", // domaine non notoire : la PME reste protégée
    ]) {
      expect(isNotoriousServiceEmail(v, on), v).toBe(false);
    }
    // Strict ne passe pas le flag : tout reste redacted.
    expect(isNotoriousServiceEmail("security@updates.linear.app")).toBe(false);
    expect(isNotoriousServiceEmail("security@updates.linear.app", { commercial: false })).toBe(false);
  });

  it("est branché dans isNotoriousEntity (catégorie email + domaine nu, toute catégorie)", () => {
    expect(isNotoriousEntity("security@updates.linear.app", "email", { commercial: true })).toBe(true);
    expect(isNotoriousEntity("jean.dupont@gmail.com", "email", { commercial: true })).toBe(false);
    expect(isNotoriousEntity("security@updates.linear.app", "email")).toBe(false);
    // Un domaine nu est la marque quelle que soit l'étiquette du NER.
    expect(isNotoriousEntity("accounts.google.com", "company", { commercial: true })).toBe(true);
    expect(isNotoriousEntity("accounts.google.com", "location", { commercial: true })).toBe(true);
    expect(isNotoriousEntity("accounts.google.com", "company")).toBe(false);
  });
});

describe("discipline des listes (un faux n'est jamais une entité réelle célèbre)", () => {
  it("aucun domaine du pool de FAUX n'est un domaine notoire réel", () => {
    const notorious = new Set(NOTORIOUS_DOMAINS);
    for (const d of FAKE_EMAIL_DOMAINS) {
      const bare = d.replace(/^@/, "");
      expect(isNotoriousDomain(bare), d).toBe(false);
      expect(notorious.has(bare), d).toBe(false);
    }
  });

  it("aucune entrée de GENERIC_MAILBOX n'est un prénom du gazetteer (elle épargnerait une personne)", () => {
    for (const w of GENERIC_MAILBOX) {
      expect(FIRST_NAMES.has(w), w).toBe(false);
    }
  });
});

describe("buildFakeEmail — domaine notoire conservé sous la dispense, jamais un domaine identifiant", () => {
  const never = () => false;
  it("garde un domaine FOURNISSEUR verbatim quand keepKnownDomain est passé", () => {
    const fake = buildFakeEmail("jean.dupont@gmail.com", 0, () => undefined, never, 0, true);
    expect(fake.endsWith("@gmail.com")).toBe(true);
    expect(fake).not.toContain("jean.dupont");
  });
  it("swap toujours un domaine NON notoire (identifiant), dispense ou pas", () => {
    const fake = buildFakeEmail("contact@karlstudio.fr", 0, () => undefined, never, 0, true);
    expect(fake.split("@")[1]).not.toBe("karlstudio.fr");
  });
});

describe("pseudonymize e2e — les régressions des parcours du 27/08", () => {
  it("dispense commerciale : l'expéditeur de service part en clair, l'adresse personnelle garde son fournisseur, le coffre reste propre", async () => {
    const vault: Vault = {};
    const input = "Expéditeur security@updates.linear.app — écrire à jean.dupont@gmail.com";
    const r = await pseudonymize(input, { vault, commercialNotoriety: true });
    expect(r.text).toContain("security@updates.linear.app");
    expect(r.text).not.toContain("jean.dupont@gmail.com");
    expect(r.text).toMatch(/ [a-z0-9._-]+@gmail\.com/); // le faux personnel garde @gmail.com
    // AUCUN alias de domaine n'empoisonne le coffre : « gmail.com » n'est jamais un ORIGINAL.
    expect(Object.values(vault)).not.toContain("gmail.com");
  });

  it("sans le flag (Strict) : tout est redacted, et aucun FAUX n'est un domaine notoire réel", async () => {
    const vault: Vault = {};
    const r = await pseudonymize(
      "Écrire à security@updates.linear.app ou jean.dupont@gmail.com",
      { vault },
    );
    expect(r.text).not.toContain("security@updates.linear.app");
    expect(r.text).not.toContain("jean.dupont@gmail.com");
    // La clé d'un alias de domaine (faux → réel) n'est jamais un vrai domaine célèbre :
    // c'est ce qui interdit au coffre de réécrire « gmail.com » en domaine d'un tiers.
    for (const [fake, real] of Object.entries(vault)) {
      if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(real)) {
        expect(isNotoriousDomain(fake), `${fake} → ${real}`).toBe(false);
      }
    }
  });

  it("un local-part mot-courant ne fabrique JAMAIS d'alias de nom — le mot reste intact ailleurs", async () => {
    const vault: Vault = {};
    const r = await pseudonymize(
      "Rapport envoyé par notifications@karlstudio.fr. Vos notifications restent actives.",
      { vault },
    );
    expect(r.text).not.toContain("notifications@karlstudio.fr"); // l'adresse reste redacted
    // …mais « notifications » n'est jamais un ORIGINAL du coffre : la prose ordinaire
    // n'est pas réécrite (la corruption « 6 landry, toutes les heures »).
    expect(Object.values(vault)).not.toContain("notifications");
    expect(Object.values(vault)).not.toContain("Notifications");
    expect(r.text).toContain("Vos notifications restent actives.");
  });
});
