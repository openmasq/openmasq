import { describe, expect, it } from "vitest";
import { redact } from "../../index";

// Drives the real engine. `redactedUser` = the handle is gone AND a USERNAME
// placeholder took its place; `kept` = it survives in clear (rule did NOT fire).
const out = (t: string): string => redact(t, {}).text;
const redactedUser = (t: string, v: string): boolean =>
  !out(t).includes(v) && /\[REDACTED_USERNAME_\d+\]/.test(out(t));
const kept = (t: string, v: string): boolean => out(t).includes(v);

describe("username @handle detector — category 'username'", () => {
  it("redacts a leading-@ handle", () => {
    expect(redactedUser("Suis @QuavvoSinatra sur tous les réseaux", "@QuavvoSinatra")).toBe(true);
    expect(redactedUser("contact: @zarv_ko", "@zarv_ko")).toBe(true);
  });

  it("does NOT treat an EMAIL as a handle (the @ follows the local-part)", () => {
    const t = "écris à contact@example.com stp";
    expect(out(t)).not.toContain("contact@example.com"); // caught by the EMAIL rule…
    expect(/\[REDACTED_USERNAME_\d+\]/.test(out(t))).toBe(false); // …NOT the username rule
    expect(/\[REDACTED_EMAIL_\d+\]/.test(out(t))).toBe(true);
  });

  it("does NOT redact an npm scope or a CSS/decorator at-word", () => {
    expect(kept("npm i @types/node @scope/pkg", "@types/node")).toBe(true);
    expect(kept("@media (min-width: 600px) {}", "@media")).toBe(true);
    expect(kept("@Injectable() export class X {}", "@Injectable")).toBe(true);
    expect(kept("/** @param x the input */", "@param")).toBe(true);
  });
});
