import { describe, it, expect } from "vitest";
import { buildDriveUpload } from "./drive";

describe("buildDriveUpload — la frontière multipart du dépôt Drive", () => {
  const B = "acme_test_boundary";

  it("deux parties, bordure OUVERTE deux fois et FERMÉE une fois — un 400 Google ne dit jamais pourquoi", () => {
    const body = buildDriveUpload({ name: "notes.md" }, "text/markdown", "SGVsbG8=", B);
    expect(body.match(new RegExp(`--${B}\\r\\n`, "g"))).toHaveLength(2);
    expect(body.endsWith(`--${B}--`)).toBe(true);
    expect(body).toContain('{"name":"notes.md"}');
    expect(body).toContain("Content-Type: text/markdown");
    expect(body).toContain("Content-Transfer-Encoding: base64\r\n\r\nSGVsbG8=");
  });

  it("un dossier cible entre dans `parents`, jamais ailleurs", () => {
    const body = buildDriveUpload({ name: "a.txt", parents: ["FOLDER1"] }, "text/plain", "QQ==", B);
    expect(body).toContain('"parents":["FOLDER1"]');
  });

  it("un mime absent retombe sur octet-stream, jamais une chaîne vide", () => {
    const body = buildDriveUpload({ name: "x" }, "", "QQ==", B);
    expect(body).toContain("Content-Type: application/octet-stream");
  });
});
