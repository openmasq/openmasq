// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { PROVIDERS } from "@openmasq/llm";
import { mount } from "../../testKit";
import { getMessages } from "@openmasq/i18n";
import { providerKeyHelp } from "../../containers/modals/providerKeyHelp";
import { KeyChoice } from "./KeyChoice";
import { configurePlatformAccess } from "../../send/platformAccess";

/**
 * L'écran « Abonnement, ou votre clé » du premier lancement.
 *
 * Il est parti sans test, et c'est le seul écran de l'accueil qui ÉCRIT un secret. Ce
 * qu'on vérifie ici n'est donc pas la mise en page mais les trois promesses que l'écran
 * fait à la personne qui colle sa clé :
 *
 *  1. la clé part chez le BON fournisseur — la ranger sous le mauvais est invisible à
 *     l'écran et ne se découvre qu'au premier envoi, sous la forme d'une erreur qui ne
 *     nomme pas sa cause ;
 *  2. un échec d'enregistrement est DIT — sans ça, on repart en croyant sa clé posée
 *     alors qu'elle n'existe nulle part (règle produit : un échec réel est toujours
 *     montré, jamais avalé) ;
 *  3. la clé n'est jamais RELUE par l'interface — elle est chiffrée côté privilégié, et
 *     l'écran ne doit pas la garder à l'écran ni dans le DOM après l'avoir envoyée.
 */

const noop = () => {};

// Le défaut du paquet (un build hébergé) — restauré pour que l'ordre des tests ne compte pas.
afterEach(() => configurePlatformAccess({ served: true }));

describe("KeyChoice — l'accès aux modèles au premier lancement", () => {
  it("envoie la clé au fournisseur SÉLECTIONNÉ, débarrassée de ses espaces", async () => {
    const saved: { provider: string; key: string }[] = [];
    const m = await mount(
      <KeyChoice
        mode="byo"
        onMode={noop}
        onSaveKey={async (provider, key) => {
          saved.push({ provider, key });
        }}
        keyConfigured={new Set()}
      />,
    );

    // On choisit explicitement Anthropic : la valeur par défaut est OpenRouter, donc un
    // câblage qui ignorerait la sélection passerait inaperçu sans ce clic.
    const anthropic = m
      .findAll(".ob-access-provider")
      .find((b) => b.textContent?.includes(PROVIDERS.anthropic.label))!;
    await m.click(anthropic);
    await m.type(".ob-access-input", "  sk-ant-secret  ");
    await m.click(".ob-access-save");

    expect(saved).toEqual([{ provider: "anthropic", key: "sk-ant-secret" }]);

    await m.unmount();
  });

  it("DIT l'échec au lieu de laisser croire que la clé est posée", async () => {
    const m = await mount(
      <KeyChoice
        mode="byo"
        onMode={noop}
        onSaveKey={async () => {
          throw new Error("trousseau verrouillé");
        }}
        keyConfigured={new Set()}
      />,
    );

    await m.type(".ob-access-input", "sk-test");
    await m.click(".ob-access-save");

    // Le message du refus, pas un « Réessayez » générique qui perdrait la cause.
    expect(m.find(".ob-access-error").textContent).toContain("trousseau verrouillé");
    // Et le bouton redevient actionnable : un échec qui laisse « Enregistrement… » à
    // l'écran est un cul-de-sac.
    expect(m.find<HTMLButtonElement>(".ob-access-save").disabled).toBe(false);

    await m.unmount();
  });

  it("ne garde la clé NULLE PART dans le DOM une fois envoyée", async () => {
    const SECRET = "sk-ne-doit-pas-rester";
    const m = await mount(
      <KeyChoice mode="byo" onMode={noop} onSaveKey={async () => {}} keyConfigured={new Set()} />,
    );

    await m.type(".ob-access-input", SECRET);
    await m.click(".ob-access-save");

    expect(m.find<HTMLInputElement>(".ob-access-input").value).toBe("");
    expect(m.el.innerHTML).not.toContain(SECRET);

    await m.unmount();
  });

  it("masque la saisie — une clé collée ne se lit pas par-dessus l'épaule", async () => {
    const m = await mount(
      <KeyChoice mode="byo" onMode={noop} onSaveKey={async () => {}} keyConfigured={new Set()} />,
    );
    expect(m.find<HTMLInputElement>(".ob-access-input").type).toBe("password");
    await m.unmount();
  });

  it("ne redemande pas une clé déjà enregistrée — il n'y a rien à ressaisir", async () => {
    const m = await mount(
      <KeyChoice
        mode="byo"
        onMode={noop}
        onSaveKey={async () => {}}
        keyConfigured={new Set(["openrouter"])}
      />,
    );

    expect(m.maybe(".ob-access-input")).toBeNull();
    expect(m.find(".ob-access-saved").textContent).toContain(PROVIDERS.openrouter.label);

    await m.unmount();
  });

  it("guide vers la clé du fournisseur choisi, sans retaper son adresse", async () => {
    const m = await mount(
      <KeyChoice mode="byo" onMode={noop} onSaveKey={async () => {}} keyConfigured={new Set()} />,
    );

    // Les étapes cochables du fournisseur sélectionné, et le lien OFFICIEL du registre.
    expect(m.findAll(".byo-steps li").length).toBeGreaterThan(0);
    expect(m.find<HTMLAnchorElement>(".byo-link").href).toBe(
      providerKeyHelp("openrouter", getMessages("fr"))!.keyUrl,
    );

    // Changer de fournisseur change le guide ET repart d'une liste vierge : une coche
    // héritée du fournisseur précédent est un faux marque-page.
    await m.click(
      m.findAll(".ob-access-provider").find((b) => b.textContent?.includes(PROVIDERS.openai.label))!,
    );
    await m.click(".byo-tick");
    expect(m.find(".byo-steps li").className).toContain("done");
    await m.click(
      m
        .findAll(".ob-access-provider")
        .find((b) => b.textContent?.includes(PROVIDERS.anthropic.label))!,
    );
    expect(m.find(".byo-steps li").className).not.toContain("done");

    await m.unmount();
  });

  it("dit au collage qu'une clé vient visiblement d'un autre fournisseur — sans bloquer", async () => {
    const saved: string[] = [];
    const m = await mount(
      <KeyChoice
        mode="byo"
        onMode={noop}
        onSaveKey={async (_p, key) => {
          saved.push(key);
        }}
        keyConfigured={new Set()}
      />,
    );

    await m.type(".ob-access-input", "sk-ant-0123456789abcdef0123");
    expect(m.find(".byo-issue").className).toContain("error");
    expect(m.find(".byo-issue").textContent).toContain("sk-or-");

    // Le verdict explique, il n'interdit pas : le préfixe est de la documentation, pas
    // un contrat, et un blocage sur une forme périmée serait un cul-de-sac.
    expect(m.find<HTMLButtonElement>(".ob-access-save").disabled).toBe(false);
    await m.click(".ob-access-save");
    expect(saved).toHaveLength(1);

    await m.unmount();
  });

  it("sans `host.keys` (aperçu web) le formulaire n'existe pas — la plateforme dégrade en silence", async () => {
    const m = await mount(<KeyChoice mode="byo" onMode={noop} keyConfigured={new Set()} />);

    expect(m.maybe(".ob-access-key")).toBeNull();
    // Le CHOIX reste offert : c'est le formulaire qui manque, pas l'étape.
    expect(m.findAll(".ob-access-opt")).toHaveLength(2);

    await m.unmount();
  });

  it("sans service hébergé, la carte « Mon compte » n'existe pas et le formulaire s'ouvre seul", async () => {
    // Un build sans backend (`SELF_HOSTING.md`) n'a AUCUN abonnement à proposer : offrir
    // le choix serait offrir une porte qui ne mène nulle part. Il ne reste qu'un chemin,
    // donc plus de question — le formulaire est l'étape.
    configurePlatformAccess({ served: false });
    const m = await mount(
      <KeyChoice mode={null} onMode={noop} onSaveKey={async () => {}} keyConfigured={new Set()} />,
    );

    expect(m.findAll(".ob-access-opt")).toHaveLength(1);
    expect(m.find(".ob-access-opt").textContent).toMatch(/clé/i);
    expect(m.maybe(".ob-access-key")).not.toBeNull();

    await m.unmount();
  });

  it("en mode abonnement, aucun champ de clé — l'étape ne réclame rien", async () => {
    const m = await mount(
      <KeyChoice
        mode="subscription"
        onMode={noop}
        onSaveKey={async () => {}}
        keyConfigured={new Set()}
      />,
    );

    expect(m.maybe(".ob-access-key")).toBeNull();
    expect(m.find(".ob-access-opt").getAttribute("aria-pressed")).toBe("true");

    await m.unmount();
  });
});
