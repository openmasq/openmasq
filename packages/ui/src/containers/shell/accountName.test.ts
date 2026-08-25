import { describe, it, expect } from "vitest";
import { accountDisplayName, firstNameOf } from "./accountName";

describe("accountDisplayName", () => {
  it("turns a dotted email local-part into a two-word name (→ 'TG' initials)", () => {
    expect(accountDisplayName("julien.sabourdin@gmail.com")).toBe("Julien Sabourdin");
  });

  it("handles the other email separators (_ + -)", () => {
    expect(accountDisplayName("jean_pierre@x.io")).toBe("Jean Pierre");
    expect(accountDisplayName("a-b+c@x.io")).toBe("A B C");
  });

  it("returns a single word for a separator-less local-part (→ one initial)", () => {
    expect(accountDisplayName("julien@gmail.com")).toBe("Julien");
  });

  it("falls back to 'Vous' when there is no usable email", () => {
    expect(accountDisplayName(undefined)).toBe("Vous");
    expect(accountDisplayName(null)).toBe("Vous");
    expect(accountDisplayName("")).toBe("Vous");
    expect(accountDisplayName("@nolocal.com")).toBe("Vous");
  });
});

describe("firstNameOf (home greeting)", () => {
  it("prefers the OAuth name's first token", () => {
    expect(firstNameOf({ name: "Julien Sabourdin", email: "autre.compte@gmail.com" })).toBe("Julien");
    expect(firstNameOf({ name: "  julien " })).toBe("Julien");
  });
  it("falls back to the email's first token when there's no name", () => {
    expect(firstNameOf({ email: "jean.rebour@gmail.com" })).toBe("Jean");
  });
  it("is undefined when there's no usable source (never the placeholder 'Vous')", () => {
    expect(firstNameOf(null)).toBeUndefined();
    expect(firstNameOf({})).toBeUndefined();
    expect(firstNameOf({ email: "@nolocal.com" })).toBeUndefined();
  });
});
