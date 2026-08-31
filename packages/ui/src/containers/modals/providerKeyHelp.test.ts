import { describe, expect, it } from "vitest";
import { PROVIDERS } from "@openmasq/llm";
import { getMessages, LOCALES } from "@openmasq/i18n";
import { providerKeyHelp, providerKeyIssue } from "./providerKeyHelp";

/**
 * Le verdict rendu au moment où l'on COLLE une clé.
 *
 * Ce qu'on épingle n'est pas le libellé mais la ligne de partage : ce dont on a la
 * preuve (le préfixe documenté) se dit comme une erreur, ce dont on n'a qu'un soupçon
 * (une longueur) se dit comme un avertissement, et un fournisseur sans forme fixe ne se
 * voit reprocher AUCUNE forme. Se tromper de côté est cher : un faux positif renvoie
 * quelqu'un chercher une deuxième clé qui n'existe pas.
 */

/* Les verdicts et les formes de clé ne dépendent pas de la langue ; le catalogue
   français est le témoin, et les messages attendus plus bas sont les siens. */
const t = getMessages("fr");
/** Les fournisseurs dont la clé est documentée — l'union du catalogue, moins les deux
 *  entrées de verdict qui vivent dans le même namespace. */
const DOCUMENTED = ["openai", "anthropic", "google", "mistral", "deepseek", "openrouter"] as const;

describe("providerKeyIssue — ce qui se voit à la saisie", () => {
  it("nomme le préfixe attendu quand la clé vient visiblement d'ailleurs", () => {
    const issue = providerKeyIssue("anthropic", "sk-or-v1-0123456789abcdef0123", t);
    expect(issue?.level).toBe("error");
    expect(issue?.message).toContain("sk-ant-");
    // Le fournisseur est nommé avec le libellé du registre, jamais son id technique.
    expect(issue?.message).toContain(PROVIDERS.anthropic.label);
  });

  it("laisse passer une clé bien formée", () => {
    expect(providerKeyIssue("openrouter", "sk-or-v1-0123456789abcdef0123", t)).toBeUndefined();
  });

  it("n'invente aucune forme pour un fournisseur qui n'en publie pas", () => {
    // Mistral ne documente pas de préfixe : une clé courte reste un simple soupçon,
    // et une clé longue quelconque ne déclenche rien.
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
    // Les deux vivent dans la même entrée : s'ils divergent, l'écran promet une forme
    // dans le champ et en reproche une autre sous le champ. Et chaque fournisseur
    // documenté doit porter ses étapes DANS LES DEUX LANGUES — un tutoriel vide serait
    // un écran de clé sans mode d'emploi, la panne que ce fichier existe pour éviter.
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
