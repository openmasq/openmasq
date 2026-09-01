import { describe, it, expect } from "vitest";
import { pseudonymize, applyVault } from "../index";
import type { Detection, Vault } from "../types";

// A canned model detector: returns the given findings JSON verbatim.
const model = (json: string) => async () => json;

// A realistic MCP "info <tool>" result (the PostHog shape that triggered the reported
// overredaction): YAML metadata whose `name:` is a kebab tool id, prose full of
// analytics vocabulary, and a trailing "Timezone: UTC" note.
const TOOL_INFO = `name: read-data-schema
title: Read data schema
description: Use this tool to explore the user's data schema. Events or properties
starting from "$" are system properties automatically captured by SDKs.
annotations:
  destructiveHint: false
inputSchema: '{"type":"object","properties":{"query":{"type":"string"}}}'

Use 'query-trends' to discover available events, actions, and properties.
Note: rows marked "(partial)" are incomplete. Timezone: UTC.`;

describe("MCP tool metadata rides in CLEAR (overredaction regression)", () => {
  it("the deterministic pass detects nothing — text verbatim, vault untouched", async () => {
    const vault = {};
    const r = await pseudonymize(TOOL_INFO, { complete: model("[]"), vault });
    expect(r.text).toBe(TOOL_INFO);
    expect(Object.keys(vault)).toEqual([]);
  });

  it("an over-flagging model detector is neutralised at the choke point", async () => {
    const complete = model(
      JSON.stringify([
        { value: "read-data-schema", category: "NAME" },
        { value: "Read data schema", category: "NAME" },
        { value: "query-trends", category: "NAME" },
        { value: "UTC", category: "ORG" },
        { value: "data", category: "NAME" },
        { value: "schema", category: "NAME" },
      ]),
    );
    const vault = {};
    const r = await pseudonymize(TOOL_INFO, { complete, vault });
    expect(r.text).toContain("read-data-schema");
    expect(r.text).toContain("query-trends");
    expect(r.text).toContain("Timezone: UTC");
    expect(Object.keys(vault)).toEqual([]);
  });

  it("a real person in the same YAML shape is still redacted", async () => {
    const txt = "name: John Welby\nemail: john.welby@corp.io";
    const r = await pseudonymize(txt, { complete: model("[]"), vault: {} });
    expect(r.text).not.toContain("John Welby");
    expect(r.text).not.toContain("john.welby@corp.io");
  });

  /**
   * 15/08 — SAME failure, from the two words the vocabulary block didn't carry:
   * "##### 1. System Data" read as a name manufactured the System/system aliases, and
   * "entity" became a surname. The model then received a doc describing
   * `ghislain.*` tables and wrote SQL against them.
   */
  const NER: Detection[] = [
    { value: "System Data", category: "NAME" },
    { value: "entity", category: "NAME" },
  ];
  const DOC = `##### 1. System Data (PostHog-Created Data)

All these tables are prefixed with \`system.\`. The most-used entities are
\`system.insights\` and \`system.dashboards\`.

Each event, action, and entity has its own data schema.`;

  it("un mot qui STRUCTURE la doc ne devient pas un alias de conversation", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize(DOC, { vault, detectLocal: async () => NER });
    expect(text).toContain("system.insights");
    expect(text).toContain("entity");
    const reals = Object.values(vault).map((v) => v.toLowerCase());
    for (const mot of ["system", "entity", "system.insights"])
      expect(reals, `« ${mot} » est entré au coffre`).not.toContain(mot);
  });

  it("le TOUR SUIVANT n'est plus contaminé — c'est là que le bug se voyait", async () => {
    // The vault is re-applied on every new text: it's THIS replay, and not a
    // new detection, that was corrupting the doc ("local NER: 0 entities" in the log,
    // right before 4 values got replaced).
    const vault: Vault = {};
    await pseudonymize(DOC, { vault, detectLocal: async () => NER });
    const suivant = "SELECT column_name FROM system.information_schema.columns";
    expect(applyVault(suivant, vault)).toBe(suivant);
  });

  it("une VRAIE identité dans la même doc reste couverte — rien n'est affaibli", async () => {
    const vault: Vault = {};
    // ⚠️ DASH separator, not parentheses: `Label : Nom (valeur)` leaves the value
    // inside the parentheses IN CLEAR — a distinct leak, reported on 15/08, not fixed here.
    const avecPii = `${DOC}\n\nContact : Julien Sabourdin — julien@exemple.fr`;
    const { text } = await pseudonymize(avecPii, {
      vault,
      detectLocal: async () => [...NER, { value: "Julien Sabourdin", category: "NAME" }],
    });
    expect(text).not.toContain("Julien Sabourdin");
    expect(text).not.toContain("julien@exemple.fr");
    expect(Object.values(vault)).toContain("Julien Sabourdin");
  });
});
