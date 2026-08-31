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
    // Une panne ne se masque pas : elle s'en va quand elle est finie, pas au clic.
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
    // Le titre est le SEUL texte visible replié : il doit nommer le connecteur.
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
