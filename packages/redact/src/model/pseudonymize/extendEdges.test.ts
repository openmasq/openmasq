import { describe, expect, it } from "vitest";
import { pseudonymize } from "../../index";
import { extendEdges } from "./extendEdges";

const values = (out: { value: string; category: string }[]) => out.map((d) => `${d.category}:${d.value}`);

describe("extendEdges", () => {
  it("joins the house number to a street detected without it", () => {
    const text = "Payee at 4893 Justin Terrace, Springfield.";
    expect(values(extendEdges(text, [{ value: "Justin Terrace", category: "CITY" }]))).toEqual(["ADDRESS:4893 Justin Terrace"]);
  });
  it("never joins a count to a city, nor a number to a value that ends in no street type", () => {
    expect(extendEdges("we opened 4 Paris offices", [{ value: "Paris", category: "CITY" }])).toEqual([]);
    expect(extendEdges("the 12 Dupont files", [{ value: "Dupont", category: "NAME" }])).toEqual([]);
  });
  it("joins two ORG fragments that touch in the text, and only ORG ones", () => {
    const text = "held at Lublin Remand Centre; Jean Morvan Marie Dupont attended.";
    expect(values(extendEdges(text, [
      { value: "Lublin Remand", category: "ORG" }, { value: "Centre", category: "ORG" },
      { value: "Jean Morvan", category: "NAME" }, { value: "Marie Dupont", category: "NAME" },
    ]))).toEqual(["ORG:Lublin Remand Centre"]);
  });
  it("the street number reaches the wire in the fake, through the pipeline", async () => {
    const vault: Record<string, string> = {};
    const r = await pseudonymize("Ship it to 4893 Justin Terrace, Springfield.", { vault });
    expect(r.text).not.toContain("4893 Justin Terrace");
    expect(r.text).not.toMatch(/4893 /);
  });
});
