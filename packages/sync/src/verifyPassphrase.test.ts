import { describe, it, expect } from "vitest";
import { createConvKey } from "./crypto";
import { verifyPassphrase } from "./verifyPassphrase";
import type { ConvKeyEnvelope, RecordTransport } from "./types";

/**
 * La divergence du 14/08 : un appareil à phrase différente ne reçoit AUCUN signal — il
 * pousse dans un monde parallèle et scelle chaque portée étrangère. Le verdict rendu ici
 * est ce qui transforme cette découverte différée en avertissement immédiat à la saisie.
 */

const transportWith = (envelopes: Record<string, ConvKeyEnvelope>): RecordTransport =>
  ({
    listConvKeys: async () => Object.keys(envelopes),
    getConvKey: async (id: string) => envelopes[id] ?? null,
  }) as unknown as RecordTransport;

describe("verifyPassphrase — la phrase saisie est confrontée aux enveloppes du serveur", () => {
  it("« match » quand la phrase ouvre une enveloppe existante", async () => {
    const { envelope } = await createConvKey("bonne phrase");
    expect(await verifyPassphrase(transportWith({ "@integrations": envelope }), "bonne phrase")).toBe("match");
  });

  it("« mismatch » quand une AUTRE phrase règne sur le serveur (le cas du 14/08)", async () => {
    const { envelope } = await createConvKey("la phrase du mobile");
    expect(await verifyPassphrase(transportWith({ "@integrations": envelope }), "la phrase du desktop")).toBe(
      "mismatch",
    );
  });

  it("« match » dès qu'UNE enveloppe s'ouvre — un compte déjà divergé porte les deux mondes", async () => {
    const autre = (await createConvKey("autre monde")).envelope;
    const mienne = (await createConvKey("ma phrase")).envelope;
    expect(await verifyPassphrase(transportWith({ c1: autre, c2: mienne }), "ma phrase")).toBe("match");
  });

  it("« no-envelopes » sur un compte vierge — toute phrase est la bonne", async () => {
    expect(await verifyPassphrase(transportWith({}), "peu importe")).toBe("no-envelopes");
  });

  it("« unreachable » quand le serveur ne répond pas — on ne sait pas, on ne bloque pas", async () => {
    const transport = {
      listConvKeys: async () => {
        throw new Error("réseau");
      },
    } as unknown as RecordTransport;
    expect(await verifyPassphrase(transport, "x")).toBe("unreachable");
  });
});
