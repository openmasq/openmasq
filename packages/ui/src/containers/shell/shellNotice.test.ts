import { getMessages } from "@openmasq/i18n";
import { describe, expect, it } from "vitest";
import { pickShellNotice } from "./shellNotice";

const NONE = { reconnecting: false, mcpItems: [], showAccess: false };

const fr = getMessages("fr");

describe("pickShellNotice", () => {
  it("ne dit rien quand tout va bien", () => {
    expect(pickShellNotice(NONE, fr)).toBeNull();
  });

  it("la panne réseau passe devant tout le reste", () => {
    const n = pickShellNotice({
      reconnecting: true,
      mcpItems: [{ id: "slack", name: "Slack" }],
      showAccess: true,
    }, fr);
    expect(n?.kind).toBe("offline");
    // An outage cannot be dismissed: it goes away once it's over, not by clicking.
    expect(n?.dismissible).toBe(false);
    expect(n?.actionLabel).toBeUndefined();
  });

  it("un connecteur tombé passe devant l'information d'accès", () => {
    const n = pickShellNotice({
      ...NONE,
      mcpItems: [{ id: "slack", name: "Slack" }],
      showAccess: true,
    }, fr);
    expect(n?.kind).toBe("mcp");
    // The title is the ONLY text visible when collapsed: it must name the connector.
    expect(n?.title).toContain("Slack");
    expect(n?.actionLabel).toBe("Reconnecter");
  });

  it("plusieurs connecteurs : le titre compte, le détail les nomme", () => {
    const n = pickShellNotice({
      ...NONE,
      mcpItems: [
        { id: "slack", name: "Slack" },
        { id: "gmail", name: "Gmail" },
      ],
    }, fr);
    expect(n?.title).toContain("2 connecteurs");
    expect(n?.message).toContain("Slack, Gmail");
  });

  it("l'information d'accès est refermable", () => {
    const n = pickShellNotice({ ...NONE, showAccess: true }, fr);
    expect(n?.kind).toBe("access");
    expect(n?.tone).toBe("info");
    expect(n?.dismissible).toBe(true);
  });
});
