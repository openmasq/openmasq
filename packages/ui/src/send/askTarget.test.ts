import { describe, expect, it } from "vitest";
import { askTargetLaunchText, askTargetLabel } from "./askTarget";

describe("askTargetLaunchText", () => {
  it("names a CLOUD folder with its service and points at that service's tools", () => {
    const line = askTargetLaunchText({ kind: "folder", name: "patrons", source: "Dropbox" });
    expect(line).toContain("dossier « patrons »");
    expect(line).toContain("stocké sur Dropbox");
    expect(line).toContain("les outils Dropbox");
  });

  it("names a LOCAL folder with its path and points at the file tools", () => {
    const line = askTargetLaunchText({ kind: "folder", name: "Devis", path: "/Users/x/Devis" });
    expect(line).toContain("dossier « Devis »");
    expect(line).toContain("chemin local : /Users/x/Devis");
    expect(line).toContain("les outils de fichiers");
  });

  it("says fichier for a file", () => {
    expect(askTargetLaunchText({ kind: "file", name: "cv.pdf", source: "Dropbox" })).toContain(
      "fichier « cv.pdf »",
    );
  });

  it("degrades to a generic connector mention when neither path nor source is known", () => {
    const line = askTargetLaunchText({ kind: "folder", name: "x" });
    expect(line).toContain("les outils du connecteur");
  });
});

describe("askTargetLabel", () => {
  it("reads kind, name, then service", () => {
    expect(askTargetLabel({ kind: "folder", name: "patrons", source: "Dropbox" })).toBe(
      "Dossier : patrons — Dropbox",
    );
    expect(askTargetLabel({ kind: "file", name: "cv.pdf" })).toBe("Fichier : cv.pdf");
  });
});
