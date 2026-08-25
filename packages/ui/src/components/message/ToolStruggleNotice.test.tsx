// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { mount } from "../../testKit";
import { ToolStruggleNotice } from "./ToolStruggleNotice";
import { OpenConnectorProvider } from "../../containers/providers/connectors";
import type { ToolStruggle } from "../../agent/mcpAgent";

const struggle = (kind: ToolStruggle["kind"]): ToolStruggle => ({
  server: "gmail",
  tool: "gmail__list_recent",
  kind,
});

/**
 * Un jeton OAuth expiré est le `connector_error` le plus courant, et la légende se
 * terminait sur « Ouvrez Réglages → Connecteurs » : un écran à trouver, puis un connecteur
 * à reconnaître parmi une dizaine — alors que le message venait de le nommer. Ces tests
 * épinglent que la réparation est atteignable DEPUIS le tour qui a échoué.
 */
describe("ToolStruggleNotice — la réparation est à portée de clic", () => {
  it("offre « Reconnecter » sur un refus de connecteur, et ouvre CE connecteur", async () => {
    const open = vi.fn();
    const m = await mount(
      <OpenConnectorProvider value={open}>
        <ToolStruggleNotice struggle={struggle("connector_error")} />
      </OpenConnectorProvider>,
    );
    await m.click("button");
    // L'id du connecteur fautif, pas un écran générique : c'est toute la différence.
    expect(open).toHaveBeenCalledWith("gmail");
    await m.unmount();
  });

  it("l'offre vaut aussi pour un outil absent — ça se règle dans la même fiche", async () => {
    const open = vi.fn();
    const m = await mount(
      <OpenConnectorProvider value={open}>
        <ToolStruggleNotice struggle={struggle("unknown_tool")} />
      </OpenConnectorProvider>,
    );
    await m.click("button");
    expect(open).toHaveBeenCalledWith("gmail");
    await m.unmount();
  });

  it("PAS de bouton quand la cause tient au modèle — il enverrait au mauvais endroit", async () => {
    const open = vi.fn();
    for (const kind of ["arg_error", "no_tool_used"] as const) {
      const m = await mount(
        <OpenConnectorProvider value={open}>
          <ToolStruggleNotice struggle={struggle(kind)} modelName="Laguna" />
        </OpenConnectorProvider>,
      );
      expect(m.maybe("button")).toBeNull();
      await m.unmount();
    }
    expect(open).not.toHaveBeenCalled();
  });

  it("nomme la MARQUE du connecteur, jamais le transport « Ipc » (signalé 13/08)", async () => {
    // Ce que la boucle enregistrait réellement : `server` = l'id de connexion du client
    // MCP. La légende s'ouvrait donc sur « Ipc a refusé l'appel… », et « Reconnecter »
    // ouvrait la fiche d'un connecteur inexistant. Le nom de l'outil, lui, dit vrai —
    // y compris sur un message DÉJÀ enregistré, que ce test rejoue.
    const open = vi.fn();
    const m = await mount(
      <OpenConnectorProvider value={open}>
        <ToolStruggleNotice
          struggle={{ server: "ipc", tool: "gmail__search_messages", kind: "connector_error" }}
        />
      </OpenConnectorProvider>,
    );
    const txt = m.find(".shield-caption").textContent ?? "";
    expect(txt).toContain("Gmail");
    expect(txt).not.toContain("Ipc");
    await m.click("button");
    expect(open).toHaveBeenCalledWith("gmail");
    await m.unmount();
  });

  it("la phrase parle français : l'action est traduite, le nom technique reste en infobulle", async () => {
    const m = await mount(
      <ToolStruggleNotice
        struggle={{ server: "ipc", tool: "gmail__search_messages", kind: "connector_error" }}
      />,
    );
    const caption = m.find(".shield-caption");
    expect(caption.textContent).toContain("Recherche");
    // Le nom de l'outil est une adresse de support, pas une phrase : il ne paraît pas
    // dans le texte, mais reste atteignable pour qui doit le lire.
    expect(caption.textContent).not.toContain("gmail__search_messages");
    expect(caption.getAttribute("title")).toContain("gmail__search_messages");
    await m.unmount();
  });

  it("sans canal monté, retombe sur la PROSE qui nomme la destination", async () => {
    // `useOpenConnector()` vaut null dans un harnais d'aperçu ou un test : le composant
    // doit rester montable ET rester utile. Sans cette prose, l'utilisateur n'aurait plus
    // aucune indication là où il en avait une.
    const m = await mount(<ToolStruggleNotice struggle={struggle("connector_error")} />);
    expect(m.maybe("button")).toBeNull();
    expect(m.find(".shield-caption").textContent).toContain("Réglages");
    await m.unmount();
  });
});
