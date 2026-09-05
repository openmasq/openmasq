import type { Host } from "@openmasq/ui";

/**
 * The subscription-CLI slots of the host (probe, opt-in mirror, account read, set-up),
 * each present only when the preload exposes it — an un-restarted preload predating a
 * method leaves the corresponding path unavailable (fail-closed: the CLI isn't offered,
 * the set-up rows aren't drawn) rather than assigning a method that returns undefined.
 */
export function subscriptionHost(): Pick<
  Host,
  | "probeClaudeCli"
  | "probeCodexCli"
  | "probeAntigravityCli"
  | "readSubscriptionAccount"
  | "setSubscriptionEnabled"
  | "readSubscriptionStatus"
  | "installSubscriptionCli"
  | "onSubscriptionInstallProgress"
  | "loginSubscriptionCli"
  | "submitSubscriptionLoginCode"
  | "cancelSubscriptionLogin"
  | "onSubscriptionLoginEvent"
> {
  const w = window.openmasq;
  return {
    probeClaudeCli: w.probeClaudeCli ? () => w.probeClaudeCli!() : undefined,
    probeCodexCli: w.probeCodexCli ? () => w.probeCodexCli!() : undefined,
    probeAntigravityCli: w.probeAntigravityCli ? () => w.probeAntigravityCli!() : undefined,
    readSubscriptionAccount: w.readSubscriptionAccount ? (cli) => w.readSubscriptionAccount!(cli) : undefined,
    setSubscriptionEnabled: w.setSubscriptionEnabled ? (cli, on) => w.setSubscriptionEnabled!(cli, on) : undefined,
    readSubscriptionStatus: w.readSubscriptionStatus ? (cli) => w.readSubscriptionStatus!(cli) : undefined,
    installSubscriptionCli: w.installSubscriptionCli ? (cli) => w.installSubscriptionCli!(cli) : undefined,
    onSubscriptionInstallProgress: w.onSubscriptionInstallProgress
      ? (cb) => w.onSubscriptionInstallProgress!(cb)
      : undefined,
    loginSubscriptionCli: w.loginSubscriptionCli ? (cli) => w.loginSubscriptionCli!(cli) : undefined,
    submitSubscriptionLoginCode: w.submitSubscriptionLoginCode
      ? (cli, code) => w.submitSubscriptionLoginCode!(cli, code)
      : undefined,
    cancelSubscriptionLogin: w.cancelSubscriptionLogin ? (cli) => w.cancelSubscriptionLogin!(cli) : undefined,
    onSubscriptionLoginEvent: w.onSubscriptionLoginEvent ? (cb) => w.onSubscriptionLoginEvent!(cb) : undefined,
  };
}
