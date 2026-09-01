import { describe, expect, it } from "vitest";
import { PROVIDERS } from "@openmasq/llm";
import { getMessages, LOCALES } from "@openmasq/i18n";
import { providerKeyHelp, providerKeyIssue } from "./providerKeyHelp";

/**
 * The verdict rendered the moment a key is PASTED.
 *
 * What's pinned here isn't the label but the dividing line: what we have
 * proof of (the documented prefix) is stated as an error, what we only have a suspicion
 * about (a length) is stated as a warning, and a provider with no fixed shape is never
 * reproached for ANY shape. Getting the side wrong is costly: a false positive sends
 * someone off looking for a second key that doesn't exist.
 */

/* The verdicts and key shapes don't depend on the language; the French
   catalog is the witness, and the messages expected below are its. */
const t = getMessages("fr");
/** The providers whose key is documented — the catalog's union, minus the two
 *  verdict entries that live in the same namespace. */
const DOCUMENTED = ["openai", "anthropic", "google", "mistral", "deepseek", "openrouter"] as const;

describe("providerKeyIssue — ce qui se voit à la saisie", () => {
  it("nomme le préfixe attendu quand la clé vient visiblement d'ailleurs", () => {
    const issue = providerKeyIssue("anthropic", "sk-or-v1-0123456789abcdef0123", t);
    expect(issue?.level).toBe("error");
    expect(issue?.message).toContain("sk-ant-");
    // The provider is named with the registry's label, never its technical id.
    expect(issue?.message).toContain(PROVIDERS.anthropic.label);
  });

  it("laisse passer une clé bien formée", () => {
    expect(providerKeyIssue("openrouter", "sk-or-v1-0123456789abcdef0123", t)).toBeUndefined();
  });

  it("n'invente aucune forme pour un fournisseur qui n'en publie pas", () => {
    // Mistral doesn't document a prefix: a short key remains a mere suspicion,
    // and any long key triggers nothing.
    expect(providerKeyHelp("mistral", t)?.prefix).toBeUndefined();
    expect(providerKeyIssue("mistral", "0123456789abcdef0123456789", t)).toBeUndefined();
  });

  it("ne signale une longueur que comme un soupçon", () => {
    const issue = providerKeyIssue("openai", "sk-court", t);
    expect(issue?.level).toBe("warn");
  });

  it("ne dit rien tant que le champ est vide ou blanc", () => {
    expect(providerKeyIssue("openai", "", t)).toBeUndefined();
    expect(providerKeyIssue("openai", "   ", t)).toBeUndefined();
  });

  it.each(LOCALES)("[%s] chaque préfixe déclaré est celui que montre le placeholder", (locale) => {
    // The two live in the same entry: if they diverge, the screen promises one shape
    // in the field and reproaches a different one under the field. And every documented
    // provider must carry its steps IN BOTH LANGUAGES — an empty tutorial would be
    // a key screen with no instructions, the failure this file exists to prevent.
    const tt = getMessages(locale);
    for (const provider of DOCUMENTED) {
      const help = providerKeyHelp(provider, tt)!;
      expect(help.steps?.length, provider).toBeGreaterThan(2);
      expect(help.note?.trim(), provider).not.toBe("");
      if (!help.prefix || !help.placeholder) continue;
      expect(help.placeholder.startsWith(help.prefix), provider).toBe(true);
    }
  });
});
