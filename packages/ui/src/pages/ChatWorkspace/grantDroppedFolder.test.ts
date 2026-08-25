import { describe, it, expect, vi } from "vitest";
import type { McpHost, McpServerInfo } from "../../host";
import {
  FS_CONNECTOR_ID,
  FS_DIRS_KEY,
  grantDroppedFolder,
  grantMessage,
  isFsServerId,
} from "./grantDroppedFolder";

const server = (dirs: string[]): McpServerInfo =>
  ({ id: FS_CONNECTOR_ID, params: { [FS_DIRS_KEY]: dirs } }) as unknown as McpServerInfo;

const ok = {} as McpServerInfo;

function host(over: Partial<McpHost> = {}): McpHost {
  return {
    pickDir: vi.fn(async () => "/Users/x/Projets"),
    setDirs: vi.fn(async () => ok),
    addStdio: vi.fn(async () => ok),
    connect: vi.fn(async () => ok),
    ...over,
  } as unknown as McpHost;
}

describe("grantDroppedFolder — the grant is what the DIALOG returns", () => {
  it("passes the dropped path as a HINT only, and grants the PICKED one", async () => {
    // The invariant: a renderer-supplied path must never reach `setDirs`. If it ever did,
    // an XSS would grant itself any folder on the disk.
    const mcp = host({ pickDir: vi.fn(async () => "/Users/x/Autre") });
    const out = await grantDroppedFolder({ mcp, servers: [server([])] }, "/Users/x/Déposé");
    expect(mcp.pickDir).toHaveBeenCalledWith("/Users/x/Déposé");
    expect(mcp.setDirs).toHaveBeenCalledWith(FS_CONNECTOR_ID, FS_DIRS_KEY, ["/Users/x/Autre"]);
    expect(out).toEqual({ status: "granted", path: "/Users/x/Autre" });
  });

  it("CARRIES OVER the existing roots — widening scope must not revoke what was granted", async () => {
    const mcp = host();
    await grantDroppedFolder({ mcp, servers: [server(["/a", "/b"])] }, undefined);
    expect(mcp.setDirs).toHaveBeenCalledWith(FS_CONNECTOR_ID, FS_DIRS_KEY, [
      "/a",
      "/b",
      "/Users/x/Projets",
    ]);
  });

  it("installs the connector with the dropped folder as its ONLY root when absent", async () => {
    const mcp = host();
    const out = await grantDroppedFolder({ mcp, servers: [] }, undefined);
    expect(mcp.addStdio).toHaveBeenCalledWith(FS_CONNECTOR_ID, {}, { [FS_DIRS_KEY]: ["/Users/x/Projets"] });
    expect(out.status).toBe("granted");
  });

  // ── The live bug: « Autorisation refusée : unknown server » ────────────────────────
  // `mcpAddStdio` registers a stdio entry as `local-<catalogId>`. Keying `connect` and
  // `setDirs` on the CATALOG id therefore reached no server at all.
  it("CONNECTS on the id addStdio RETURNS, not on the catalog id", async () => {
    const mcp = host({
      addStdio: vi.fn(async () => ({ id: "local-filesystem" }) as McpServerInfo),
    });
    await grantDroppedFolder({ mcp, servers: [] }, undefined);
    expect(mcp.connect).toHaveBeenCalledWith("local-filesystem");
    expect(mcp.connect).not.toHaveBeenCalledWith(FS_CONNECTOR_ID);
  });

  it("FINDS an already-installed connector under its `local-` server id", async () => {
    // Before the fix this lookup missed, so every drop took the install branch and then
    // connected on a name no server had.
    const mcp = host();
    const installed = { id: "local-filesystem", params: { [FS_DIRS_KEY]: ["/a"] } } as unknown as McpServerInfo;
    await grantDroppedFolder({ mcp, servers: [installed] }, undefined);
    expect(mcp.addStdio).not.toHaveBeenCalled();
    expect(mcp.setDirs).toHaveBeenCalledWith("local-filesystem", FS_DIRS_KEY, ["/a", "/Users/x/Projets"]);
  });

  it("still recognises a folder already in scope on the `local-` id", async () => {
    const mcp = host({ pickDir: vi.fn(async () => "/a") });
    const installed = { id: "local-filesystem", params: { [FS_DIRS_KEY]: ["/a"] } } as unknown as McpServerInfo;
    expect(await grantDroppedFolder({ mcp, servers: [installed] }, undefined)).toEqual({
      status: "already",
      path: "/a",
    });
  });

  it("a CANCELLED dialog grants nothing and is not an error", async () => {
    const mcp = host({ pickDir: vi.fn(async () => undefined) });
    const out = await grantDroppedFolder({ mcp, servers: [server([])] }, "/Users/x/Déposé");
    expect(out).toEqual({ status: "cancelled" });
    expect(mcp.setDirs).not.toHaveBeenCalled();
    expect(grantMessage(out)).toBeNull(); // silent on purpose
  });

  it("says so when the folder is already in scope, rather than doing nothing", async () => {
    const mcp = host({ pickDir: vi.fn(async () => "/a") });
    const out = await grantDroppedFolder({ mcp, servers: [server(["/a"])] }, undefined);
    expect(out).toEqual({ status: "already", path: "/a" });
    expect(mcp.setDirs).not.toHaveBeenCalled();
  });

  it("surfaces a host REFUSAL instead of swallowing it", async () => {
    // The privileged side refuses a root that did not come from the dialog this session.
    const mcp = host({
      setDirs: vi.fn(async () => ({ error: "dossier non autorisé" }) as McpServerInfo),
    });
    const out = await grantDroppedFolder({ mcp, servers: [server([])] }, undefined);
    expect(out).toEqual({ status: "error", message: "dossier non autorisé" });
    expect(grantMessage(out)).toContain("dossier non autorisé");
  });

  it("surfaces a refusal from the INSTALL path too", async () => {
    const mcp = host({ addStdio: vi.fn(async () => ({ error: "refusé" }) as McpServerInfo) });
    const out = await grantDroppedFolder({ mcp, servers: [] }, undefined);
    expect(out).toEqual({ status: "error", message: "refusé" });
    expect(mcp.connect).not.toHaveBeenCalled();
  });

  it("reports a throw rather than leaving the card spinning", async () => {
    const mcp = host({
      pickDir: vi.fn(async () => {
        throw new Error("dialogue indisponible");
      }),
    });
    expect(await grantDroppedFolder({ mcp, servers: [] }, undefined)).toEqual({
      status: "error",
      message: "dialogue indisponible",
    });
  });

  it("is unavailable — not broken — on a platform with no picker", async () => {
    expect(await grantDroppedFolder({ mcp: undefined, servers: [] }, undefined)).toEqual({
      status: "unavailable",
    });
    const noSetDirs = host({ setDirs: undefined });
    expect(await grantDroppedFolder({ mcp: noSetDirs, servers: [server([])] }, undefined)).toEqual({
      status: "unavailable",
    });
  });

  it("notifies the caller only on a real change", async () => {
    const onChanged = vi.fn();
    await grantDroppedFolder({ mcp: host(), servers: [server([])], onChanged }, undefined);
    expect(onChanged).toHaveBeenCalledTimes(1);
    onChanged.mockClear();
    await grantDroppedFolder(
      { mcp: host({ pickDir: vi.fn(async () => undefined) }), servers: [], onChanged },
      undefined,
    );
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe("isFsServerId — the catalog id is not the server id", () => {
  it("accepts both spellings", () => {
    expect(isFsServerId("filesystem")).toBe(true);
    expect(isFsServerId("local-filesystem")).toBe(true);
  });

  it("does not match another connector", () => {
    expect(isFsServerId("local-other")).toBe(false);
    expect(isFsServerId("notion")).toBe(false);
  });
});
