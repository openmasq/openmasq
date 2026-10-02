import { describe, expect, it, vi } from "vitest";
import type { ConnectorToolCtx } from "../types";
import { onedriveSafeName, onedriveUploadFile, onedriveUploadUrl, ONEDRIVE_SIMPLE_UPLOAD_MAX } from "./onedriveUpload";
import { microsoftOneDriveConnector } from "./onedrive";

const GRAPH = "https://graph.microsoft.com/v1.0";

function ctx(fetchJson: ConnectorToolCtx["fetchJson"]): ConnectorToolCtx {
  return { fetchJson, fetchText: vi.fn() } as unknown as ConnectorToolCtx;
}
const docx = {
  filename: "Entretien_annuel.docx",
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  contentBase64: Buffer.from("PK-bytes").toString("base64"),
};

describe("OneDrive upload_file — déposer un document de la conversation", () => {
  it("le connecteur l'expose, derrière l'autorisation d'ÉCRITURE", () => {
    const tool = microsoftOneDriveConnector.tools.find((t) => t.name === "upload_file");
    expect(tool?.scope).toBe("Files.ReadWrite");
    expect(microsoftOneDriveConnector.scopes).toEqual({ managed: ["Files.ReadWrite"], byo: ["Files.ReadWrite.All"] });
  });

  it("PUT des octets ORIGINAUX à la racine, sans jamais écraser un homonyme", async () => {
    const fetchJson = vi.fn(async () => ({ id: "01ABCDEF", name: "Entretien_annuel.docx" }));
    const out = await onedriveUploadFile.run({ file: "Entretien_annuel.docx", __attachmentData: [docx] }, ctx(fetchJson as never));
    const [url, init] = fetchJson.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${GRAPH}/me/drive/root:/Entretien_annuel.docx:/content?@microsoft.graph.conflictBehavior=rename`);
    expect(init.method).toBe("PUT");
    expect(Buffer.from(init.body as Buffer).toString()).toBe("PK-bytes");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(docx.mimeType);
    expect((out.content[0] as { text: string }).text).toContain("· id:01ABCDEF");
  });

  it("un nom choisi par le modèle ne devient jamais un CHEMIN", () => {
    expect(onedriveSafeName("../../secret/x.txt")).toBe("_.._secret_x.txt");
    expect(onedriveUploadUrl("a/b?.md", null)).toContain("/root:/a_b_.md:/content");
    expect(onedriveUploadUrl("n.md", "01FOLDER")).toContain("/items/01FOLDER:/n.md:/content");
  });

  it("au-delà de 4 Mo : refusé AVANT l'appel, avec une phrase", async () => {
    const fetchJson = vi.fn();
    const big = { ...docx, contentBase64: Buffer.alloc(ONEDRIVE_SIMPLE_UPLOAD_MAX + 1).toString("base64") };
    const out = await onedriveUploadFile.run({ file: "x", __attachmentData: [big] }, ctx(fetchJson as never));
    expect(out.isError).toBe(true);
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it("403 (connexion en lecture seule) : dit de reconnecter, pas un code nu", async () => {
    const fetchJson = vi.fn(async () => {
      throw new Error("Upstream request failed (403): accessDenied");
    });
    const out = await onedriveUploadFile.run({ text: "x", name: "n.md" }, ctx(fetchJson as never));
    expect((out.content[0] as { text: string }).text).toMatch(/Reconnecte OneDrive/);
  });
});
