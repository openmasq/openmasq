import { describe, expect, it } from "vitest";
import { pseudonymize, redact } from "../../index";

const STRICT = { disabledKinds: [] as string[] };
const DEFAULT = { disabledKinds: ["date"] };

describe("the `date` category — every non-birth date, opt-in", () => {
  it("a bare call never touches a plain date; a level that names its categories and leaves `date` on does", async () => {
    const t = "Meeting on 12/05/2024, invoice dated 2024-05-12, born on 3 March 1955, delivered May 12, 2024.";
    const bare = await pseudonymize(t, {});
    expect(bare.text).toContain("12/05/2024");
    expect(bare.text).toContain("May 12, 2024");
    const dflt = await pseudonymize(t, DEFAULT);
    expect(dflt.text).toContain("12/05/2024");
    const strict = await pseudonymize(t, STRICT);
    expect(strict.text).not.toContain("12/05/2024");
    expect(strict.text).not.toContain("2024-05-12");
    expect(strict.text).not.toContain("May 12, 2024");
  });
  it("a birth date keeps its own category (dob) even with dates on", async () => {
    const vault: Record<string, string> = {};
    const r = await pseudonymize("Né le 3 mars 1955 à Lyon, rendez-vous le 4 avril 2026.", { vault, ...STRICT });
    expect(r.text).not.toContain("3 mars 1955");
    expect(r.text).not.toContain("4 avril 2026");
    // one fake per real date: nothing minted twice
    expect(Object.values(vault).filter((v) => v === "3 mars 1955")).toHaveLength(1);
  });
  it("a version, a bare year, an impossible calendar date and an epoch are not dates", async () => {
    const t = "release 2.3.10, in 1989, code 31/13/2024, epoch 1712345678";
    const r = await pseudonymize(t, STRICT);
    expect(r.text).toBe(t);
  });
  it("the forms a document writes a moment in: ISO date-times, clock times, compact bank dates, ordinals", async () => {
    const t = "Booked 2023-10-21T09:00:00+01:00, value date 20231015, call at 16:22:38 UTC then 8:15 AM, opens 07h30, closes 8.45 a.m., signed the 7th day of February, 1974, filed 15th March, 2023.";
    const r = await pseudonymize(t, STRICT);
    for (const real of ["2023-10-21T09:00:00+01:00", "20231015", "16:22:38", "8:15 AM", "07h30", "8.45 a.m.", "7th day of February, 1974", "15th March, 2023"]) expect(r.text, real).not.toContain(real);
  });
  it("a duration, a bare year, a quarter and a 45-minute score are not moments", async () => {
    const t = "24 hours later, in 2010, Q2 2023, 45:30 into the match, vier Wochen";
    expect((await pseudonymize(t, STRICT)).text).toBe(t);
  });
  it("the marker mode follows the same opt-in", () => {
    expect(redact("due 12/05/2024").text).toContain("12/05/2024");
    expect(redact("due 12/05/2024", STRICT).text).not.toContain("12/05/2024");
  });
});
