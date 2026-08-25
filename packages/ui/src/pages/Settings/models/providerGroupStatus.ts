import { PROVIDERS, isPlatformProvider, type ModelInfo, type ProviderId } from "@openmasq/llm";
import { unavailableLabel, type UnavailableReason } from "../../../send/modelAvailability";
import { BRAND } from "@openmasq/branding";

/**
 * What a provider GROUP header says about availability, derived once instead of stamped
 * on every card. Pure (`ModelsTab` renders it) so the wording rules below are readable
 * and can't drift into JSX — logic in `.ts`, presentation in `.tsx`.
 */

export interface ProviderKeyStatus {
  text: string;
  check: boolean;
  blocked: boolean;
  title: string;
}

export interface ProviderGroupStatus {
  /** The reason shared by EVERY model of the group, or null when it is mixed. */
  groupReason: UnavailableReason | null;
  /** A single header chip for a NOT-keyed provider; null when the key pill says it. */
  groupChip: { chip: string; title: string } | null;
  /** The key pill; null for a provider that takes no personal key. */
  keyStatus: ProviderKeyStatus | null;
}

export function providerGroupStatus(p: {
  pid: ProviderId;
  group: ModelInfo[];
  /** This provider accepts a personal API key (`KEYED_PROVIDERS`). */
  keyed: boolean;
  /** A key for it is already stored on this machine. */
  hasKey: boolean;
  unavailableModels?: ReadonlyMap<string, UnavailableReason>;
}): ProviderGroupStatus {
  const label = PROVIDERS[p.pid].label;
  // Uniform unavailability across the whole group → state it ONCE in the header instead
  // of repeating the same chip on every card.
  const reasons = p.group.map((m) => p.unavailableModels?.get(m.id));
  const groupReason =
    reasons.every(Boolean) && new Set(reasons).size === 1 ? reasons[0]! : null;

  // A keyed provider's `no_key` group is ALREADY conveyed by its key pill + gear, so it
  // never shows a bare "Abonnement requis" — that read as a dead end when adding a key
  // was right there. A NOT-keyed provider can only be unlocked one way, so it says so.
  const groupChip = groupReason && !p.keyed ? unavailableLabel(groupReason, label) : null;

  // ONE chip, never "Aucune clé" + "Abonnement requis" side by side.
  const keyStatus: ProviderKeyStatus | null = !p.keyed
    ? null
    : p.hasKey
      ? {
          text: "Clé enregistrée",
          check: true,
          blocked: false,
          title: `Une clé ${label} est enregistrée sur cet appareil.`,
        }
      : groupReason === "no_key"
        ? {
            text: "Clé requise",
            check: false,
            blocked: true,
            title: `Ajoutez votre clé ${label} pour utiliser ces modèles.`,
          }
        : groupReason === "no_credits"
          ? {
              text: "Clé ou abonnement",
              check: false,
              blocked: true,
              title: `Crédits ${BRAND.name} épuisés. Ajoutez votre clé ${label} pour un envoi direct, ou prenez un abonnement.`,
            }
          : isPlatformProvider(p.pid)
            ? {
                // Keyless but USABLE: the group routes through the app's gateway on the
                // subscription. « Aucune clé » read as a blocker — say both real paths.
                text: "Clé ou abonnement",
                check: false,
                blocked: false,
                title: `Sans clé, ces modèles passent par votre abonnement ${BRAND.name} (crédits). Ajoutez votre clé ${label} pour un envoi direct.`,
              }
            : {
                text: "Aucune clé",
                check: false,
                blocked: false,
                title: `Aucune clé ${label} n'est enregistrée sur cet appareil.`,
              };

  return { groupReason, groupChip, keyStatus };
}
