// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// The journal source is mocked: what is under test is the modal's OFFER — when it
// appears, whether it is pre-checked, and what the payload carries — not the debug
// buffer's own serialization (pinned by `DebugLogModal/entryText.test.ts`).
const { journalExportFor } = vi.hoisted(() => ({ journalExportFor: vi.fn() }));
vi.mock("./DebugLogModal/entryText", () => ({ journalExportFor }));

import { mount } from "../../testKit";
import { AvisModal } from "./AvisModal";
import type { Feedback } from "../../avis/avis";

const JOURNAL = "[10:02:03] WIRE → gpt-5\nBonjour [PERSON1]";

/** Mount the modal on a host that can send, and drive it to a sendable draft. */
async function openAvis() {
  // Typed on its ARGUMENT, not `vi.fn(async () => {})`: a zero-arity mock makes
  // `calls[0]` an empty tuple, so reading the payload back below is a type error.
  const send = vi.fn(async (_f: Feedback) => {});
  const m = await mount(<AvisModal onClose={() => {}} context={{ version: "0.4.0" }} />, {
    host: { avis: { send } },
  });
  await m.click(".om-avis-mood"); // a mood is required to send
  await m.type(".om-avis-textarea", "le modèle répond à côté");
  const pickCategory = async (label: string) => {
    const btn = m.findAll(".om-avis-cat").find((b) => b.textContent === label);
    await m.click(btn!);
  };
  const sendIt = async (): Promise<Feedback> => {
    await m.click(".om-avis-foot .btn-primary");
    return send.mock.calls[0][0] as Feedback;
  };
  return { m, send, pickCategory, sendIt };
}

describe("AvisModal — the debug journal offer on a Bug report", () => {
  beforeEach(() => {
    journalExportFor.mockReset().mockReturnValue(JOURNAL);
  });

  it("offers nothing on a non-Bug report", async () => {
    const { m } = await openAvis();
    expect(m.maybe(".om-avis-journal")).toBeNull();
  });

  it("offers the journal as soon as the category is Bug", async () => {
    // The gap this closes: a bug card arriving with no logs costs a round-trip, and
    // the offer used to exist ONLY behind the journal modal's own button.
    const { m, pickCategory } = await openAvis();
    await pickCategory("Bug");
    expect(m.maybe(".om-avis-journal")).not.toBeNull();
  });

  it("arrive PRÉ-COCHÉ, l'aperçu verbatim à l'écran, et le journal part avec l'envoi", async () => {
    // Decision 13/08 (permanent collection): a bug report with no journal costs a
    // round-trip. What makes the pre-checking honest is ON SCREEN: the preview shows
    // the EXACT text that goes out (export « sans mapping » — never a vault value).
    const { m, pickCategory, sendIt } = await openAvis();
    await pickCategory("Bug");
    expect(m.find(".om-avis-journal [role=switch]").getAttribute("aria-checked")).toBe("true");
    expect(m.find(".om-avis-journal-preview").textContent).toBe(JOURNAL);
    expect((await sendIt()).journal).toBe(JOURNAL);
  });

  it("le refus reste un geste unique : décocher retire l'aperçu et rien ne part", async () => {
    const { m, pickCategory, sendIt } = await openAvis();
    await pickCategory("Bug");
    await m.click(".om-avis-journal [role=switch]");
    expect(m.find(".om-avis-journal [role=switch]").getAttribute("aria-checked")).toBe("false");
    expect(m.maybe(".om-avis-journal-preview")).toBeNull();
    expect(await sendIt()).not.toHaveProperty("journal");
  });

  it("takes the offer back when the category leaves Bug", async () => {
    const { m, pickCategory, sendIt } = await openAvis();
    await pickCategory("Bug");
    await pickCategory("Idée");
    expect(m.maybe(".om-avis-journal")).toBeNull();
    expect(await sendIt()).not.toHaveProperty("journal");
  });

  it("offers nothing when the journal is empty (debug mode off)", async () => {
    journalExportFor.mockReturnValue("");
    const { m, pickCategory } = await openAvis();
    await pickCategory("Bug");
    expect(m.maybe(".om-avis-journal")).toBeNull();
  });
});
