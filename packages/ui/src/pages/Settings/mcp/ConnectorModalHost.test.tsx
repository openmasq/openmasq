// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mount } from "../../../testKit";
import { ConnectorModalHost } from "./ConnectorModalHost";

/**
 * L'hôte qui rend la modale d'un connecteur ouvrable AILLEURS que dans Réglages. Deux
 * choses le tiennent, et une seule les casse toutes les deux :
 *
 * 1. Il doit s'ouvrir dès le PREMIER rendu. `useMcpConnectors` appliquait le connecteur
 *    demandé dans un `useEffect`, donc `openId` valait `null` le temps d'une frame — et
 *    l'hôte, qui se démonte quand plus rien n'est ouvert, se serait refermé avant même
 *    d'avoir ouvert.
 * 2. Il doit rendre la main quand on ferme, sinon la coquille le garde monté et le même
 *    connecteur ne se ré-ouvre jamais (le nonce ne changerait rien, l'élément est déjà là).
 */

// La PRÉSENCE du slot `mcp` est exactement ce qu'on teste : c'est la plateforme desktop.
const host = {
  mcp: {
    list: async () => [],
    catalog: async () => [],
    onChanged: () => () => {},
    // Présent sur le desktop : c'est lui qui fait exister les connecteurs « direct ».
    connectDirect: async () => undefined,
  },
};

const open = (onClose: () => void) =>
  mount(<ConnectorModalHost connectorId="slack" nonce={1} onClose={onClose} />, {
    host: host as never,
  });

describe("ConnectorModalHost", () => {
  it("ouvre la modale du connecteur demandé, sans se refermer au montage", async () => {
    const onClose = vi.fn();
    const m = await open(onClose);
    expect(m.maybe(".modal-scrim")).not.toBeNull();
    expect(m.el.textContent).toContain("Slack");
    // Le piège : un `openId` initialement nul aurait déclenché la fermeture ici même.
    expect(onClose).not.toHaveBeenCalled();
    await m.unmount();
  });

  it("rend la main à la coquille quand la pile est refermée", async () => {
    const onClose = vi.fn();
    const m = await open(onClose);
    await m.click(".modal-scrim");
    expect(onClose).toHaveBeenCalled();
    await m.unmount();
  });
});
