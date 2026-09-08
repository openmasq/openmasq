import { describe, expect, it } from "vitest";
import { unredactReply } from "@openmasq/redact";
import { StreamRestorer } from "./restorer";

const vault = { "Marc Charvet": "Camille Roussel", "Kelby Works": "Atelier Sud", n1: "42" };
const make = () => new StreamRestorer(vault, (t) => unredactReply(t, vault));

const drain = (r: StreamRestorer, deltas: string[]) =>
  deltas.map((d) => r.push(d)).join("") + r.flush();

describe("StreamRestorer", () => {
  it("restores a fake that arrives whole", () => {
    expect(drain(make(), ["Hello Marc Charvet, welcome."])).toBe("Hello Camille Roussel, welcome.");
  });

  it("restores a fake split across deltas — never a half name on the wire", () => {
    const r = make();
    const parts = ["Hello Ma", "rc Cha", "rvet, wel", "come to Kelby", " Works."];
    const out: string[] = [];
    for (const p of parts) out.push(r.push(p));
    out.push(r.flush());
    // No released piece ever contains a partial fake.
    for (const piece of out) {
      expect(piece).not.toMatch(/Marc|Charvet|Kelby|Works/);
    }
    expect(out.join("")).toBe("Hello Camille Roussel, welcome to Atelier Sud.");
  });

  it("releases text as soon as the tail can no longer start a token", () => {
    const r = make();
    expect(r.push("Bonjour tout le monde. ")).toBe("Bonjour tout le monde. ");
    // "Ma" could begin "Marc Charvet": held back.
    expect(r.push("Ma")).toBe("");
    expect(r.pending).toBe(2);
    // "Mais" cannot: released whole.
    expect(r.push("is oui")).toBe("Mais oui");
    expect(r.flush()).toBe("");
  });

  it("passes everything through when the vault is empty", () => {
    const r = new StreamRestorer({}, (t) => t);
    expect(r.push("Marc Ch")).toBe("Marc Ch");
    expect(r.push("arvet")).toBe("arvet");
  });

  it("releases a complete fake whole even when its last letters could start a shorter token", () => {
    // The engine vaults the e-mail AND its domain alone: the final `m` of the complete e-mail
    // could begin `melvio.com`, which used to hold it back and release the e-mail cut.
    const v = {
      "armelle.aubertin@melvio.com": "camille.roussel@exemple.fr",
      "melvio.com": "exemple.fr",
      armelle: "camille",
      aubertin: "roussel",
    };
    const r = new StreamRestorer(v, (t) => unredactReply(t, v));
    const text = "Écris à armelle.aubertin@melvio.com, merci.";
    const out: string[] = [];
    for (const p of text.match(/.{1,5}/g)!) out.push(r.push(p));
    out.push(r.flush());
    expect(out.join("")).toBe("Écris à camille.roussel@exemple.fr, merci.");
    for (const piece of out) expect(piece).not.toMatch(/melvio|armelle|aubertin/);
  });

  it("does not confuse a short token with a longer one that shares its prefix", () => {
    const v = { n1: "one", n12: "twelve" };
    const r = new StreamRestorer(v, (t) => unredactReply(t, v));
    expect(drain(r, ["n", "1", "2 and n1."])).toBe("twelve and one.");
  });
});
