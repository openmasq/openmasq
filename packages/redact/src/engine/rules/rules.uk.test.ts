import { describe, expect, it } from "vitest";
import { redact } from "../../index";

// Le NINO britannique s'ÉCRIT par paires. Un contrat de travail anglais, une fiche de paie,
// un P45, un P60 et gov.uk lui-même impriment « AB 12 34 56 C » — la forme collée est
// l'exception, pas la règle. Tant que seule la forme collée tirait, l'identifiant national
// d'un salarié britannique partait en clair sur son écriture la plus courante.
function out(text: string): string {
  return redact(text, {}).text;
}
function redacted(text: string, value: string): boolean {
  const o = out(text);
  return !o.includes(value) && /\[REDACTED_NATIONAL_ID_\d+\]/.test(o);
}

describe("UK National Insurance number — les deux écritures", () => {
  it("redacted la forme COLLÉE (inchangé)", () => {
    expect(redacted("National Insurance number AB123456C", "AB123456C")).toBe(true);
  });

  it("redacted la forme ESPACÉE — celle des documents", () => {
    expect(redacted("National Insurance number AB 12 34 56 C", "AB 12 34 56 C")).toBe(true);
    expect(redacted("Her NINO is JT 60 66 05 B and she is paid monthly.", "JT 60 66 05 B")).toBe(true);
  });

  it("redacted les espaces INSÉCABLES qu'une extraction PDF émet verbatim", () => {
    expect(redacted("NI number: AB 12 34 56 C", "AB 12 34 56 C")).toBe(true);
  });

  it("ne franchit AUCUN saut de ligne — sans somme de contrôle, un préfixe rogné passerait", () => {
    // Le NINO n'a pas de clé : la reprise de préfixe valide ne pourrait pas rejeter un
    // « AB 12\n34 » tronqué, et réparer la fuite créerait un faux positif. Limite assumée.
    expect(out("AB 12\n34\n56 C")).toContain("AB 12");
    expect(out("NINO AB 12 34\n56 C fin")).toContain("56 C");
  });

  it("ne mord pas sur une suite de mots ou de groupes ordinaire", () => {
    // Lettres de tête hors classe (D/F/I/O/Q/U/V) ou lettre de queue hors A-D.
    expect(out("DF 12 34 56 C")).toContain("DF 12 34 56 C");
    expect(out("AB 12 34 56 Z")).toContain("AB 12 34 56 Z");
    // Groupes de mauvaise longueur.
    expect(out("AB 123 45 6 C")).toContain("AB 123 45 6 C");
  });
});
