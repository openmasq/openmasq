import { BRAND } from "@openmasq/branding";
import { useT } from "../../i18n";
import { useState } from "react";
import { PROVIDERS, type ProviderId } from "@openmasq/llm";
import { CheckIcon } from "../../components/brand";
import { KeySteps } from "./KeySteps";
import { KeyChoiceAgents } from "./KeyChoiceAgents";
import type { AgentOptIn } from "../../hooks/useAgentOptIns";
import { platformAccessServed, subscriptionsSold } from "../../send/platformAccess";

/** The providers the onboarding offers a key slot for — OpenRouter first (one key,
 *  every model), then the majors. Labels/key URLs come from the single-source
 *  registry (`@openmasq/llm` PROVIDERS, rule 9) — never re-typed here. */
const KEY_PROVIDERS: ProviderId[] = [
  "openrouter",
  "openai",
  "anthropic",
  "google",
  "mistral",
  "deepseek",
];

/**
 * Onboarding step « Accès aux modèles » : the subscription-vs-your-own-key choice —
 * and, on a host that can probe them, the third road: a subscription CLI already
 * installed (Claude Code, Codex, Antigravity).
 *
 * All paths already exist in Réglages (AccountTab's billing toggle, the per-provider
 * key modal, the agent opt-ins of Réglages → Modèles); this step only SURFACES them at
 * first run. The key is write-only: `onSaveKey` → `host.keys.set` (encrypted in main,
 * never read back — the renderer only learns WHICH providers hold one), exactly like
 * the Settings path. The agent switches write `Settings.*CliEnabled`, the same opt-in
 * as `AgentAccessModal`, through the same list (`useAgentOptIns`, rule 9).
 *
 * OpenRouter is the one provider with TWO roads, and they are not offered side by side:
 * the OAuth flow mints a key with nothing to copy, so it is the whole panel until the
 * person says they already have one — at which point they get the same guided checklist
 * (`KeySteps`) as every other provider. Showing both at once made the shorter road look
 * like one option out of two.
 *
 * ⚠️ The agent card is NOT a billing mode: `billingMode` says how a KEYED provider is
 * paid, and a CLI is neither keyed nor billed here. So the card is a PANEL choice held
 * locally (`agentPath`), pre-opened when an agent is already enabled; the subtitle
 * promised this road (« ou votre abonnement Claude Code / Codex ») while nothing on
 * the screen led to it — the card is that door. With no probeable agent (web preview)
 * it isn't drawn: a card with nothing under it would be the same broken promise.
 */
export function KeyChoice({
  mode,
  onMode,
  onSaveKey,
  onConnectOpenRouter,
  keyConfigured,
  agents = [],
}: {
  /** The choice ALREADY made, or `null` — no one has answered yet. Pre-checking it would
   *  make the flow's one real question disappear; and pre-checking it on the subscription
   *  would pre-fill it with the option that costs money. */
  mode: "subscription" | "byo" | null;
  onMode: (m: "subscription" | "byo") => void;
  /** Absent (no `host.keys` — preview) ⇒ the key form is not rendered. */
  onSaveKey?: (provider: string, key: string) => Promise<void>;
  /** OAuth PKCE — the platform opens the browser, receives the callback and stores the
   *  key ITSELF (it never reaches this component). Absent ⇒ only the paste path shows. */
  onConnectOpenRouter?: () => Promise<boolean>;
  keyConfigured: ReadonlySet<string>;
  /** The subscription CLIs this build can offer (`useAgentOptIns`). Empty ⇒ no card. */
  agents?: AgentOptIn[];
}) {
  // Does this build have a hosted service? Without it, "Mon compte" doesn't exist.
  const served = platformAccessServed();
  const t = useT();
  const [provider, setProvider] = useState<ProviderId>("openrouter");
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectFailed, setConnectFailed] = useState(false);
  const [manual, setManual] = useState(false);
  const [error, setError] = useState("");
  // The agent panel is open: pre-opened when one is already on (coming back to this step).
  const [agentPath, setAgentPath] = useState(() => agents.some((a) => a.enabled));
  // The five other providers sit behind « Autre fournisseur »: OpenRouter alone is the
  // recommendation, and six chips made it one option out of six. Pre-unfolded when a
  // key already sits on one of them — a saved key must never hide behind a link.
  const [othersOpen, setOthersOpen] = useState(() =>
    KEY_PROVIDERS.some((p) => p !== "openrouter" && keyConfigured.has(p)),
  );

  // « Obtenir une clé gratuitement » — the key ends up on the USER's OpenRouter account,
  // so their own credits AND their own free-model quota. That second half matters: those
  // quotas are per ACCOUNT at OpenRouter, so a key we minted would only ever hand out a
  // slice of one shared bucket.
  const canConnect = provider === "openrouter" && !!onConnectOpenRouter;
  const connect = async () => {
    if (!onConnectOpenRouter || connecting) return;
    setConnecting(true);
    setError("");
    try {
      if (await onConnectOpenRouter()) setConnectFailed(false);
      else {
        setConnectFailed(true);
        setError(t.onboarding.keyChoice.errorIncomplete);
      }
    } catch {
      setConnectFailed(true);
      setError(t.onboarding.keyChoice.errorUnreachable);
    } finally {
      setConnecting(false);
    }
  };

  const save = async (key: string): Promise<boolean> => {
    if (!onSaveKey) return false;
    setBusy(true);
    setError("");
    try {
      await onSaveKey(provider, key);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : t.onboarding.keyChoice.errorSaveFailed);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const pickProvider = (p: ProviderId) => {
    setProvider(p);
    setManual(false);
    setConnectFailed(false);
    setError("");
  };

  const option = (
    on: boolean,
    onPick: () => void,
    title: string,
    sub: string,
    /** "conseillé" — the recommendation reads ON the card, right where you choose. */
    tag?: string,
  ) => (
    <button
      type="button"
      className={`ob-access-opt${on ? " on" : ""}`}
      onClick={onPick}
      aria-pressed={on}
    >
      {/* The radio mark is what makes the cards read as ONE choice rather than
          buttons — the selected border alone was carrying that on its own. */}
      <span className="ob-access-radio" aria-hidden="true">
        {on && <CheckIcon size={11} />}
      </span>
      <span className="ob-access-opt-body">
        <span className="ob-access-opt-title">
          {title}
          {tag && <span className="ob-access-tag"> {tag}</span>}
        </span>
        <span className="ob-access-opt-sub">{sub}</span>
      </span>
    </button>
  );
  const pickMode = (m: "subscription" | "byo") => {
    setAgentPath(false);
    onMode(m);
  };

  return (
    <div className="ob-access">
      {/* ⚠️ This card no longer promises a free model on the app's account: what it
          describes is paid for in subscription credits, and a BRAND-NEW account has none.
          A card promising free access to someone who hasn't subscribed to anything sells
          a product they don't have — it's the other card that carries the no-subscription path.
          And it DISAPPEARS in a build with no hosted service (`send/platformAccess.ts`):
          there is then no account to offer, so no choice to pose — the key is
          the only path, and the question becomes a step. */}
      {served &&
        option(
          mode === "subscription" && !agentPath,
          () => pickMode("subscription"),
          t.onboarding.keyChoice.subscription.title(BRAND.name),
          // With nothing to sell (the default), the card says what the account includes — not
          // subscription credits no account has.
          subscriptionsSold()
            ? t.onboarding.keyChoice.subscription.sub
            : t.onboarding.keyChoice.included.sub,
        )}
      {/* The RECOMMENDED path, and the only one that costs nothing: an OpenRouter key reaches
          every model — free ones included, on the user's own account quota, never
          ours. The "conseillé" lives on the card because it's HERE that you choose; the
          rest (one-click OAuth, nothing to copy) is already below the card once it's checked. */}
      {option(
        mode === "byo" && !agentPath,
        () => pickMode("byo"),
        t.onboarding.keyChoice.ownKey.title,
        t.onboarding.keyChoice.ownKey.sub,
        t.onboarding.keyChoice.recommended,
      )}
      {/* The subscription CLI already on this machine — see the file's header. */}
      {agents.length > 0 &&
        option(
          agentPath,
          () => setAgentPath(true),
          t.onboarding.keyChoice.agent.title,
          t.onboarding.keyChoice.agent.sub,
        )}

      {agentPath && agents.length > 0 && <KeyChoiceAgents agents={agents} />}

      {!agentPath && (mode === "byo" || !served) && onSaveKey && (
        <div className="ob-access-key">
          <div className="ob-access-providers">
            {KEY_PROVIDERS.filter((p) => othersOpen || p === "openrouter").map((p) => (
              <button
                key={p}
                type="button"
                className={`ob-access-provider${provider === p ? " on" : ""}`}
                onClick={() => pickProvider(p)}
                aria-pressed={provider === p}
              >
                {keyConfigured.has(p) && <CheckIcon size={12} />} {PROVIDERS[p].label}
                {/* A single key reaches every model: that's the reason for the recommendation,
                    and it's worth saying right where you choose, not in a footnote. */}
                {p === "openrouter" && (
                  <span className="ob-access-tag">{t.onboarding.keyChoice.recommended}</span>
                )}
              </button>
            ))}
            {!othersOpen && (
              <button
                type="button"
                className="ob-access-manual ob-access-others"
                onClick={() => setOthersOpen(true)}
              >
                {t.onboarding.keyChoice.otherProvider}
              </button>
            )}
          </div>
          {keyConfigured.has(provider) ? (
            <div className="ob-access-saved">
              <CheckIcon size={14} /> {t.onboarding.keyChoice.savedKey(PROVIDERS[provider].label)}
            </div>
          ) : canConnect && !manual ? (
            <>
              <button
                type="button"
                className="ob-access-connect"
                disabled={connecting}
                onClick={() => void connect()}
                title={t.onboarding.keyChoice.connectTip(BRAND.name)}
              >
                {connecting
                  ? t.onboarding.keyChoice.connecting
                  : connectFailed
                    ? t.onboarding.keyChoice.retry
                    : t.onboarding.keyChoice.connect}
              </button>
              <p className="ob-access-hint">{t.onboarding.keyChoice.connectHint}</p>
              {/* Failure is an exit, not just a message: without this door you're
                  stuck on a button that just refused. */}
              <button type="button" className="ob-access-manual" onClick={() => setManual(true)}>
                {connectFailed
                  ? t.onboarding.keyChoice.manualCreate
                  : t.onboarding.keyChoice.manualHave}
              </button>
            </>
          ) : (
            <KeySteps key={provider} provider={provider} onSave={save} saving={busy} />
          )}
          {error && <div className="ob-access-error">{error}</div>}
        </div>
      )}
    </div>
  );
}
