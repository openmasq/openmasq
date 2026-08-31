import { PROVIDERS, isPlatformProvider, type ModelInfo, type ProviderId } from "@openmasq/llm";
import { unavailableLabel, type UnavailableReason } from "../../../send/modelAvailability";
import { BRAND } from "@openmasq/branding";
import type { Messages } from "@openmasq/i18n";
import { subscriptionsSold } from "../../../send/platformAccess";

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
  t: Messages;
}): ProviderGroupStatus {
  const st = p.t.modelsTab.status;
  const label = PROVIDERS[p.pid].label;
  // Uniform unavailability across the whole group → state it ONCE in the header instead
  // of repeating the same chip on every card.
  const reasons = p.group.map((m) => p.unavailableModels?.get(m.id));
  const groupReason =
    reasons.every(Boolean) && new Set(reasons).size === 1 ? reasons[0]! : null;

  // A keyed provider's `no_key` group is ALREADY conveyed by its key pill + gear, so it
  // never shows a bare "Abonnement requis" — that read as a dead end when adding a key
  // was right there. A NOT-keyed provider can only be unlocked one way, so it says so.
  const groupChip = groupReason && !p.keyed ? unavailableLabel(groupReason, label, p.t) : null;

  // ONE chip, never "Aucune clé" + "Abonnement requis" side by side.
  const keyStatus: ProviderKeyStatus | null = !p.keyed
    ? null
    : p.hasKey
      ? {
          text: st.keySaved,
          check: true,
          blocked: false,
          title: st.keySavedTip(label),
        }
      : groupReason === "no_key"
        ? {
            text: st.keyRequired,
            check: false,
            blocked: true,
            title: st.keyRequiredTip(label),
          }
        : groupReason === "no_credits"
          ? subscriptionsSold()
            ? {
                text: st.keyOrSubscription,
                check: false,
                blocked: true,
                title: st.creditsExhaustedTip(BRAND.name, label),
              }
            : {
                text: st.keyRequired,
                check: false,
                blocked: true,
                title: st.unavailableTip(BRAND.name, label),
              }
          : isPlatformProvider(p.pid)
            ? subscriptionsSold()
              ? {
                  // Keyless but USABLE: the group routes through the app's gateway on the
                  // subscription. « Aucune clé » read as a blocker — say both real paths.
                  text: st.keyOrSubscription,
                  check: false,
                  blocked: false,
                  title: st.viaSubscriptionTip(BRAND.name, label),
                }
              : {
                  // Même chose sans rien à vendre (le défaut) : la voie incluse est le compte.
                  text: st.keyOrAccount,
                  check: false,
                  blocked: false,
                  title: st.viaAccountTip(BRAND.name, label),
                }
            : {
                text: st.noKey,
                check: false,
                blocked: false,
                title: st.noKeyTip(label),
              };

  return { groupReason, groupChip, keyStatus };
}
