import { describe, expect, it } from "vitest";
import { pseudonymize } from "../../index";

/** Reference numbers named by their keyword re-identify the person whose name was redacted. */
describe("reference numbers after their keyword", () => {
  const vaulted = async (t: string) => {
    const vault: Record<string, string> = {};
    await pseudonymize(t, { vault, numbers: false });
    return Object.values(vault);
  };

  it.each([
    ["Case #: 2026-00318842    Date/Time: 02/07/2026", "2026-00318842"],
    ["Civil Action No. 1:25-cv-08814", "1:25-cv-08814"],
    ["Charge No. 451-2025-03318, alleging", "451-2025-03318"],
    ["Your complaint reference TGB-CMP-339184", "TGB-CMP-339184"],
    ["Your booking is confirmed – reference KX7Q2M", "KX7Q2M"],
    ["Employee ID: EMP-20417, start date", "EMP-20417"],
    ["votre réclamation n° RC-2026-004418", "RC-2026-004418"],
    ["a gray 2019 Honda CR-V, WI plate AKL-4492, was", "AKL-4492"],
    ["Vehicle: 2021 Toyota Camry, plate 8KXV22 (MA)", "8KXV22"],
    ["State Bar No. 031775, email", "031775"],
    ["registered in England and Wales under number 11847302, whose", "11847302"],
    ["Amsterdam, KvK 74219065. Contact", "74219065"],
  ])("%s", async (text, ref) => {
    expect(await vaulted(text)).toContain(ref);
  });

  it.each([
    "In this case the 2026-27 policy applies.",
    "The claim was for 1,200 dollars.",
    "Policy for 2026 renewals",
    "a case of 12 bottles",
    "The ID card expired",
    "ID ABCDE1234F ok", // a bare « ID » is too generic to anchor
    "ticket 123-45-6789 open", // a support ticket is not personal
    "plate number 3",
    "Our policy is to answer within 24 hours.",
    "Dossier complet le 12/03/2026",
    "[incident 2026-07-29] the export token leaked", // an ISO date
    "Confirmed duplicate charge on 03/01. Refund issued", // a day and month
  ])("leaves %s alone", async (text) => {
    expect(await vaulted(text)).toEqual([]);
  });
});
