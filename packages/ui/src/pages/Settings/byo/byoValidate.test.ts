import { getMessages } from "@openmasq/i18n";
import { describe, expect, it } from "vitest";
import { MCP_CONNECTORS, findConnector, type McpConnector } from "@openmasq/catalog/mcp";
import {
  blocks,
  clientIdIssue,
  clientSecretIssue,
  familyLabel,
  sharedServices,
} from "./byoValidate";

const GOOGLE_ID = "1234-abcd.apps.googleusercontent.com";

const fr = getMessages("fr");

describe("clientIdIssue", () => {
  it("accepts a real Google client id, and says nothing on an empty field", () => {
    expect(clientIdIssue("pkce", GOOGLE_ID, fr)).toBeUndefined();
    expect(clientIdIssue("pkce", `  ${GOOGLE_ID}  `, fr)).toBeUndefined();
    expect(clientIdIssue("pkce", "", fr)).toBeUndefined();
  });

  it("catches the two classic mix-ups at paste time, not three screens later", () => {
    // An API key…
    expect(clientIdIssue("pkce", "AIzaSyD-EXAMPLE", fr)).toMatchObject({ level: "error" });
    // …and the PROJECT id, which looks plausible and fails only at connect time.
    expect(clientIdIssue("pkce", "acme-desktop-431012", fr)).toMatchObject({ level: "error" });
  });

  it("requires a GUID for Microsoft and rejects a pasted line break anywhere", () => {
    expect(clientIdIssue("microsoft", "00000000-0000-0000-0000-000000000000", fr)).toBeUndefined();
    expect(clientIdIssue("microsoft", "not-a-guid", fr)).toMatchObject({ level: "error" });
    expect(clientIdIssue("device", "Iv1.a1b2c3\nd4", fr)).toMatchObject({ level: "error" });
  });

  it("does NOT invent a shape for GitHub — an unrecognised value is not a wrong one", () => {
    // GitHub ships several id formats (OAuth App hex, `Iv1.`, `Ov23li`). Refusing what
    // we merely don't recognise would lock the user out of their own credentials.
    expect(clientIdIssue("device", "Iv1.a1b2c3d4e5f6", fr)).toBeUndefined();
    expect(clientIdIssue("device", "1234567890abcdef1234", fr)).toBeUndefined();
  });
});

describe("clientSecretIssue", () => {
  it("blocks the client id pasted into the secret field", () => {
    expect(clientSecretIssue("pkce", GOOGLE_ID, fr)).toMatchObject({ level: "error" });
  });

  it("only WARNS on an unfamiliar Google secret — older clients predate GOCSPX-", () => {
    expect(clientSecretIssue("pkce", "GOCSPX-abcdef", fr)).toBeUndefined();
    const issue = clientSecretIssue("pkce", "legacy-secret-value", fr);
    expect(issue?.level).toBe("warn");
    expect(blocks(issue)).toBe(false); // …so the submit stays possible
  });
});

describe("sharedServices — « à faire une seule fois »", () => {
  const gmail = findConnector("gmail") as McpConnector;

  it("names the OTHER services the same client will serve, never the current one", () => {
    const others = sharedServices(gmail);
    expect(others).not.toContain(gmail.name);
    expect(others).toContain("Google Drive");
    expect(others.length).toBeGreaterThan(2);
    expect(familyLabel(gmail.directAuth)).toBe("Google");
  });

  it("is empty for a per-connector credential (GitHub)", () => {
    expect(sharedServices(findConnector("github") as McpConnector)).toEqual([]);
  });

  it("PARITY: every `pkce` connector really is a Google one", () => {
    // The claim "vos autres services Google" is derived from `directAuth === 'pkce'`,
    // which matches the desktop's own BYO cred group (`credGroupOf`, /^(gmail|google-)/).
    // A future non-Google pkce connector would silently join that sentence — and reuse
    // a client it has no business reusing. A test, not a "keep in sync" comment.
    for (const c of MCP_CONNECTORS.filter((x) => x.directAuth === "pkce"))
      expect(/^(gmail|google-)/.test(c.id), `"${c.id}" is pkce but not Google`).toBe(true);
  });
});
