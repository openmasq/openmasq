import { describe, expect, it } from "vitest";
import { redact } from "../../index";

// Drives the real engine. `redactedHealth` = the value is gone AND a HEALTH
// placeholder took its place; `kept` = it survives in clear (rule did NOT fire).
const out = (t: string): string => redact(t, {}).text;
const redactedHealth = (t: string, v: string): boolean =>
  !out(t).includes(v) && /\[REDACTED_HEALTH_\d+\]/.test(out(t));
const kept = (t: string, v: string): boolean => out(t).includes(v);

describe("health detectors — context-gated, category 'health'", () => {
  it("blood group: redacts WITH a blood-type keyword, kept otherwise", () => {
    expect(redactedHealth("groupe sanguin : A+", "A+")).toBe(true);
    expect(redactedHealth("blood type O-", "O-")).toBe(true);
    expect(redactedHealth("rhesus AB positif", "AB positif")).toBe(true);
    // no keyword → an ordinary "A+B" is left alone
    expect(kept("route A+B puis tournez", "A+")).toBe(true);
  });

  it("MRN: redacts after a medical-record keyword, bare number kept", () => {
    expect(redactedHealth("dossier médical : 4820193", "4820193")).toBe(true);
    expect(redactedHealth("MRN 88213470", "88213470")).toBe(true);
    expect(kept("commande 4820193 expédiée", "4820193")).toBe(true);
  });

  it("ICD-10 code: redacts after a diagnosis keyword, bare code kept", () => {
    expect(redactedHealth("diagnostic F32.1 confirmé", "F32.1")).toBe(true);
    expect(redactedHealth("ICD E11", "E11")).toBe(true);
    expect(kept("code F32 dans la config", "F32")).toBe(true);
  });

  it("ICD: the classification's REVISION and a closing paren don't break the gate", () => {
    expect(redactedHealth("diagnostic principal (CIM-10) : I48.1", "I48.1")).toBe(true);
    expect(redactedHealth("Diagnose (ICD-10): E11.9", "E11.9")).toBe(true);
    expect(redactedHealth("diagnóstico (CID/ICD): M54.5", "M54.5")).toBe(true);
    expect(redactedHealth("diagnosi ICD-10: J45.0", "J45.0")).toBe(true);
  });

  it("blood group: other languages, typographic minus, accented rhésus", () => {
    expect(redactedHealth("Blutgruppe: AB negativ", "AB negativ")).toBe(true);
    expect(redactedHealth("grupo sanguíneo: B positivo", "B positivo")).toBe(true);
    expect(redactedHealth("gruppo sanguigno: A positivo", "A positivo")).toBe(true);
    expect(redactedHealth("bloedgroep: B negatief", "B negatief")).toBe(true);
    expect(redactedHealth("groupe sanguin : A−", "A−")).toBe(true); // U+2212
    expect(redactedHealth("rhésus AB+ confirmé", "AB+")).toBe(true);
  });

  it("MRN labels in DE/ES/IT/PT/NL redact; the same numbers stay clear unbadged", () => {
    expect(redactedHealth("Patientennummer: 55098213", "55098213")).toBe(true);
    expect(redactedHealth("historia clínica nº 77120945", "77120945")).toBe(true);
    expect(redactedHealth("cartella clinica n. 66031287", "66031287")).toBe(true);
    expect(redactedHealth("prontuário: 99120384", "99120384")).toBe(true);
    expect(redactedHealth("patiëntnummer: 44210873", "44210873")).toBe(true);
    expect(kept("Bestellung 55098213 versandt", "55098213")).toBe(true);
  });
});
