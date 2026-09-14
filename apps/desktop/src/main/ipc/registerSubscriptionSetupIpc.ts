import { app } from "electron";
import type { SubscriptionCli, SubscriptionCliStatus, SubscriptionSetupResult } from "@openmasq/llm";
import { handle, str } from "./handle";
import { withMainWindow } from "../mainWindowRef";
import { subscriptionCliPath, subscriptionCwd } from "../subscription/desktop";
import { readSubscriptionAccount } from "../subscription/account";
import {
  cancelLogin,
  installPin,
  installSubscriptionCli,
  loginSupported,
  readLoginStatus,
  startLogin,
  submitLoginCode,
} from "../subscription/install";

/**
 * The SET-UP half of the subscription family: install a CLI here, sign it in, say where
 * it stands — so the person never opens a terminal. Every call is a user gesture (the
 * agent's card in Réglages → Modèles, the onboarding's access step); none needs the
 * opt-in switch, because none runs a model turn: `status` and `login` run the CLI's
 * OWN `auth status` / `auth login` (bounded, credentials never read by us —
 * `subscription/install/login.ts`), `install` downloads ONE pinned official artefact
 * (`subscription/install/pins.ts`) and lets it place itself.
 *
 * Renderer trust (rule 7): what a script reaching these channels can do is limited to
 * installing the pinned official build into the user's home, or starting the vendor's
 * sign-in page — no secret crosses, no arbitrary bytes run, no path is returned. The
 * pasted sign-in code goes to the CLI's stdin and nowhere else.
 */
const CLIS: readonly SubscriptionCli[] = ["claude", "codex", "antigravity"];
const asCli = (v: string): SubscriptionCli | null => (CLIS.includes(v as SubscriptionCli) ? (v as SubscriptionCli) : null);

export function registerSubscriptionSetupIpc(): void {
  handle("subscription:status", [str], async (_e, raw): Promise<SubscriptionCliStatus | null> => {
    const cli = asCli(raw);
    if (!cli) return null;
    const bin = subscriptionCliPath(cli);
    const pin = installPin(cli, process.platform, process.arch);
    const base = {
      cli,
      installable: pin !== null,
      connectable: loginSupported(cli),
      ...(pin ? { downloadBytes: pin.size } : {}),
    };
    if (!bin) return { ...base, installed: false, loggedIn: null };
    if (cli === "antigravity") {
      // No status command: the account is signed in when the CLI lists its models
      // (`account.ts`, the same read the account card does). Nothing listed says
      // nothing — `null`, never « not connected ».
      const account = await readSubscriptionAccount(cli, bin, subscriptionCwd(cli));
      return { ...base, installed: true, loggedIn: account ? true : null };
    }
    const login = await readLoginStatus(cli, bin, subscriptionCwd(cli));
    return { ...base, installed: true, ...login };
  });

  handle("subscription:install", [str], async (_e, raw): Promise<SubscriptionSetupResult> => {
    const cli = asCli(raw);
    if (!cli) return { ok: false, error: "unsupported" };
    return installSubscriptionCli(cli, {
      platform: process.platform,
      arch: process.arch,
      userData: app.getPath("userData"),
      home: app.getPath("home"),
      onProgress: (p) => withMainWindow((w) => w.webContents.send("subscription:install-progress", p)),
    });
  });

  handle("subscription:login", [str], async (_e, raw): Promise<SubscriptionSetupResult> => {
    const cli = asCli(raw);
    if (!cli) return { ok: false, error: "unsupported" };
    const bin = subscriptionCliPath(cli);
    if (!bin) return { ok: false, error: "install" };
    const session = startLogin(cli, bin, subscriptionCwd(cli), (ev) =>
      withMainWindow((w) => w.webContents.send("subscription:login-event", ev)),
    );
    if (!session) return { ok: false, error: "unsupported" };
    return session.done;
  });

  handle("subscription:login-code", [str, str], (_e, raw, code) => {
    const cli = asCli(raw);
    return cli ? submitLoginCode(cli, code) : false;
  });

  handle("subscription:login-cancel", [str], (_e, raw) => {
    const cli = asCli(raw);
    if (cli) cancelLogin(cli);
  });
}
