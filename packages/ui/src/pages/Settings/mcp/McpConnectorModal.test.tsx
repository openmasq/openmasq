// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "../../../testKit";
import { McpConnectorModal } from "./McpConnectorModal";
import type { McpItem } from "./mcpItems";

/**
 * Régression : un connecteur connecté PUIS bloqué par l'organisation affichait la modale
 * normale (« Voir les outils », « Déconnecter ») sans jamais dire qu'il était bloqué — la
 * carte de la grille le signalait (badge « Org »), pas cette modale. La boucle agentique
 * retire pourtant ses outils en silence : on voyait une connexion active et on croyait
 * que ça marchait.
 */

const BASE: McpItem = {
  id: "slack",
  serverId: "slack",
  name: "Slack",
  desc: "Lire vos canaux",
  tone: "sky",
  kind: "remote",
  connected: false,
  locked: false,
};

const noop = () => {};

const open = (over: Partial<McpItem>) =>
  mount(
    <McpConnectorModal
      item={{ ...BASE, ...over }}
      busy={false}
      onClose={noop}
      onConnectRemote={noop}
      onConnectApiKey={noop}
      onConnectDirect={noop}
      onConnectLocal={noop}
      onDisconnect={noop}
      onRemove={noop}
      onByo={noop}
      onInspect={noop}
      onPickDir={async () => undefined}
    />,
  );

describe("McpConnectorModal — bloqué par l'organisation", () => {
  it("le dit même DÉJÀ CONNECTÉ — et garde l'action Déconnecter", async () => {
    const m = await open({ connected: true, locked: true });
    expect(m.el.textContent).toContain("bloqué par votre organisation");
    // Il reste connecté : on doit pouvoir se déconnecter, pas rester dans une impasse.
    expect(m.el.textContent).toContain("Déconnecter");
    await m.unmount();
  });

  it("le dit quand il n'est pas connecté", async () => {
    const m = await open({ connected: false, locked: true });
    expect(m.el.textContent).toContain("bloqué par votre organisation");
    expect(m.el.textContent).not.toContain("Déconnecter");
    await m.unmount();
  });

  it("ne dit rien quand il n'est pas bloqué", async () => {
    const m = await open({ connected: true, locked: false });
    expect(m.el.textContent).not.toContain("bloqué par votre organisation");
    await m.unmount();
  });
});

/**
 * Journal du 15/08 (Vercel) : sous « Refresh token is invalid. » — de l'anglais brut — la
 * modale servait la phrase du PREMIER branchement, « vous acceptez, et c'est fini. Rien à
 * créer. ». L'utilisateur lisait donc une panne, puis un texte d'accueil, et le seul bouton
 * nommé était « Oublier » : la réparation (« Connecter ») n'était signalée nulle part.
 */
describe("McpConnectorModal — autorisation expirée", () => {
  const EXPIRED = { configured: true, error: "Refresh token is invalid." };

  it("dit la panne en français, et le geste — jamais le message brut du fournisseur", async () => {
    const m = await open(EXPIRED);
    expect(m.el.textContent).toContain("Votre autorisation a expiré");
    expect(m.el.textContent).not.toContain("Refresh token is invalid");
    await m.unmount();
  });

  it("l'aide cesse de décrire un premier branchement et pointe la reconnexion", async () => {
    const m = await open(EXPIRED);
    expect(m.el.textContent).toContain("Reconnectez-vous");
    expect(m.el.textContent).not.toContain("Rien à créer");
    // La promesse de redaction, elle, tient dans les deux états.
    expect(m.el.textContent).toContain("masquées");
    // Et la réparation reste offerte à côté d'« Oublier ».
    expect(m.el.textContent).toContain("Connecter");
    await m.unmount();
  });

  it("une panne INCONNUE garde son texte brut — on n'invente pas de phrase rassurante", async () => {
    const m = await open({ configured: true, error: "Kaboom v2 subsystem misaligned" });
    expect(m.el.textContent).toContain("Kaboom v2 subsystem misaligned");
    expect(m.el.textContent).not.toContain("Reconnectez-vous");
    await m.unmount();
  });

  it("sans erreur, l'accueil habituel est intact", async () => {
    const m = await open({ configured: true });
    expect(m.el.textContent).not.toContain("Votre autorisation a expiré");
    expect(m.el.textContent).not.toContain("Reconnectez-vous ci-dessous");
    await m.unmount();
  });
});
