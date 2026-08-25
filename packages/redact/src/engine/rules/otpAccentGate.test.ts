import { describe, it, expect } from "vitest";
import { redact } from "../../index";

/**
 * ⚠️ RÉGRESSION — « Code de sécurité : 482913 » n'était JAMAIS redacted.
 *
 * La règle listait pourtant ce libellé. Le défaut était son `\b` FINAL : en JS, `\b` est
 * ASCII-only, donc une alternative qui peut se terminer sur une lettre accentuée
 * (`s[ée]curit[ée]`) ne trouve jamais sa frontière et la garde ne se déclenche pas.
 * « Code de vérification » (qui finit par `n`) marchait — d'où un trou invisible sur la
 * seule variante accentuée. C'est exactement le piège que `gate()` documente et évite ;
 * cette règle-ci ne l'avait pas appliqué.
 *
 * Enjeu : un code OTP / 2FA derrière son étiquette française la plus courante.
 */
const caught = (t: string): boolean => redact(t).matches.some((m) => m.type === "secret");

describe("code de sécurité — la garde ne doit pas buter sur l'accent final", () => {
  it.each([
    "Code de sécurité : 482913",
    "Code de securite : 482913", // graphie sans accent (export dégradé)
    "Codes de sécurité 482913",
  ])("redacted « %s »", (t) => expect(caught(t)).toBe(true));

  it.each([
    "Code de vérification : 482913", // marchait déjà — ne doit pas casser
    "Code de confirmation : 482913",
    "Code pin : 482913",
    "otp : 482913",
  ])("n'a rien cassé sur « %s »", (t) => expect(caught(t)).toBe(true));
});

describe("la garde reste étroite", () => {
  it.each([
    "La sécurité 2024 est un enjeu.", // pas un code
    "code de sécurité renforcé", // pas de valeur numérique
    "sécurité 12", // trop court (< 4 chiffres)
  ])("laisse « %s » en clair", (t) => expect(caught(t)).toBe(false));

  it("⚠️ une COPULE entre l'étiquette et la valeur reste un trou connu", () => {
    // « Le code de sécurité EST 482913 » : le séparateur exclut les lettres, par
    // construction. Même classe que « Mdp wifi : … ». Documenté, pas corrigé ici —
    // élargir le séparateur aux mots est le levier qui fabrique des faux positifs.
    expect(caught("Le code de sécurité est 482913")).toBe(false);
  });
});
