import { describe, expect, it, vi } from "vitest";
import type { McpServerInfo } from "../host";
import { grantPickedFolder, type GrantHost } from "./useGrantFolder";

/**
 * The folder grant has ONE home now (the rail's « + » and the composer's « + » →
 * Dossier both call it), so what it pins is the contract with the host: the picker
 * is asked FIRST, the connector is installed with the granted root when absent,
 * reconnected when off, and `setDirs` always carries the roots already in place —
 * it REPLACES, so sending only the new path would silently revoke the others.
 */

const info = (over: Partial<McpServerInfo>): McpServerInfo =>
  ({ id: "local-filesystem", name: "Fichiers", url: "", kind: "stdio", connected: true, authorized: true, ...over }) as McpServerInfo;

function fakeMcp(servers: McpServerInfo[], picked: string | undefined) {
  const calls: string[] = [];
  const mcp: GrantHost = {
    pickDir: vi.fn(async () => {
      calls.push("pickDir");
      return picked;
    }),
    list: async () => servers,
    addStdio: vi.fn(async (id, _env, params) => {
      calls.push(`addStdio:${id}:${JSON.stringify(params)}`);
      return info({ connected: false });
    }),
    connect: vi.fn(async (id) => {
      calls.push(`connect:${id}`);
      return info({});
    }),
    setDirs: vi.fn(async (id, key, dirs) => {
      calls.push(`setDirs:${id}:${key}:${dirs.join(",")}`);
      return info({});
    }),
  };
  return { mcp, calls };
}

describe("grantPickedFolder", () => {
  it("un sélecteur annulé ne change rien — et ne touche pas au connecteur", async () => {
    const { mcp, calls } = fakeMcp([], undefined);
    expect(await grantPickedFolder(mcp, [])).toEqual({ granted: false });
    expect(calls).toEqual(["pickDir"]);
  });

  it("connecteur absent : installé AVEC le dossier accordé, puis connecté", async () => {
    const { mcp, calls } = fakeMcp([], "/Users/me/Dossier");
    expect(await grantPickedFolder(mcp, [])).toEqual({ granted: true });
    expect(calls).toEqual([
      "pickDir",
      'addStdio:filesystem:{"root":["/Users/me/Dossier"]}',
      "connect:local-filesystem",
    ]);
  });

  it("connecteur présent : setDirs reçoit les racines DÉJÀ accordées plus la nouvelle", async () => {
    const { mcp, calls } = fakeMcp([info({ params: { root: ["/a"] } })], "/b");
    expect(await grantPickedFolder(mcp, [])).toEqual({ granted: true });
    expect(calls).toEqual(["pickDir", "setDirs:local-filesystem:root:/a,/b"]);
  });

  it("connecteur enregistré mais éteint : reconnecté avant setDirs", async () => {
    const { mcp, calls } = fakeMcp([info({ connected: false, params: { root: ["/a"] } })], "/b");
    expect(await grantPickedFolder(mcp, [])).toEqual({ granted: true });
    expect(calls).toEqual(["pickDir", "connect:local-filesystem", "setDirs:local-filesystem:root:/a,/b"]);
  });

  it("un dossier déjà accordé n'est pas ré-envoyé ; un refus de l'hôte remonte en erreur", async () => {
    const { mcp, calls } = fakeMcp([info({ params: { root: ["/a"] } })], "/a");
    expect(await grantPickedFolder(mcp, [])).toEqual({ granted: false });
    expect(calls).toEqual(["pickDir"]);

    const refusing = fakeMcp([info({ params: { root: [] } })], "/secret");
    (refusing.mcp.setDirs as ReturnType<typeof vi.fn>).mockResolvedValueOnce(info({ error: "refusé" }));
    expect(await grantPickedFolder(refusing.mcp, [])).toEqual({ granted: false, error: "refusé" });
  });
});
