/**
 * The EN catalogue's « availability » slice — translated from the source (`../fr/availability.ts`).
 * ⚠️ A build that sells nothing must say neither « subscription » nor « credits »: see the
 * contract. `satisfies` per entry: the compiler demands EXACTLY the contract's keys.
 */
import type { Messages } from "../messages";

export const availability = {
  includedInSubscription: (brand) => `in the ${brand} subscription`,
  includedWithAccount: (brand) => `with your ${brand} account`,
  keyRequired: "Key required",
  noKeyTitle: (p) =>
    `No ${p} API key is saved on this device — add it in Settings → Models to use this model`,
  noKeyOrIncluded: (included) => `, or pick a model included ${included}.`,
  subscriptionRequired: "Subscription required",
  noCreditsSold: (brand, p) =>
    `This model goes through your ${brand} subscription, and your credits are used up. Take a subscription, or enter your own ${p} key to use it directly.`,
  unavailable: "Unavailable",
  noCreditsUnsold: (brand, p) =>
    `This model isn't available on your ${brand} account for now. Enter your own ${p} key to use it directly.`,
  freeModeSold: (brand, p) =>
    `${brand}'s free access serves Laguna and Nemotron. For this model, take a subscription or enter your own ${p} key.`,
  freeModeUnsold: (brand, p) =>
    `Your ${brand} account includes Laguna and Nemotron. For this model, enter your own ${p} key.`,
  cliRequired: "CLI required",
  cliUnavailable: (cli) =>
    `This model goes through the ${cli} CLI installed on this machine. Install it and connect it, then turn it on in Settings → Models.`,
  noEndpoint: "Address missing",
  noEndpointTitle: "Address missing — add it in Settings → Models → A model on your own computer.",
  endpointUnreachable: "Server unreachable",
  endpointUnreachableTitle:
    "Your local server (Ollama, LM Studio…) is not responding. Check that it is running.",
} satisfies Messages["availability"];
