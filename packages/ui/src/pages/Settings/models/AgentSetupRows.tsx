import { useEffect, useRef, useState } from "react";
import type { SubscriptionCliStatus } from "@openmasq/llm";
import { useT } from "../../../i18n";
import { useAgentSetup } from "../../../hooks/useAgentSetup";
import type { AgentCli } from "../../../hooks/useAgentOptIns";

/** Why the rows report a connected account: `read` = the status was read as it stands
 *  (mount, a finished install), `login` = the sign-in the person just ran here succeeded. */
export type AgentConnectedCause = "read" | "login";

/**
 * The rows that take a subscription CLI from « not on this machine » to « connected »
 * without a terminal — under the opt-in switch (`AgentAccessModal`) and in the
 * onboarding's agent list (`KeyChoiceAgents`), one component (rule 9):
 *
 *   absent     → what the click downloads (name, size, from whom), [Installer]
 *   installing → a bar, then « Installation… »
 *   installed  → « pas encore connectée », [Se connecter]
 *   connecting → the page to open, and EITHER the code to type there (codex) OR a field
 *                to paste the code the page shows (claude) — `useAgentSetup` says which
 *   connected  → the account's e-mail and plan, as the CLI reported them
 *
 * Draws nothing on a host without the set-up slots. Every failure is one line, from the
 * catalogue — the interface never shows a server's sentence.
 */
export function AgentSetupRows({
  cli,
  label,
  onConnected,
}: {
  cli: AgentCli;
  label: string;
  /** The account is connected — with WHY the rows know it. The onboarding listens: a
   *  CLI the person signs in from this very screen is the one they mean to use. */
  onConnected?: (status: SubscriptionCliStatus, cause: AgentConnectedCause) => void;
}) {
  const t = useT();
  const copy = t.modelPicker.cli.setup;
  const setup = useAgentSetup(cli);
  const [code, setCode] = useState("");
  const { status, phase } = setup;
  // Set when the person starts a sign-in here, consumed by the status that follows it.
  const loginStartedRef = useRef(false);
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;
  useEffect(() => {
    if (!status?.loggedIn) return;
    const cause: AgentConnectedCause = loginStartedRef.current ? "login" : "read";
    loginStartedRef.current = false;
    onConnectedRef.current?.(status, cause);
  }, [status]);
  const login = () => {
    loginStartedRef.current = true;
    setup.login();
  };
  if (!setup.supported) return null;

  if (status === undefined) {
    return <div className="agent-account-row agent-setup-row"><div className="agent-account-note">{copy.checking}</div></div>;
  }
  if (status === null) return null;

  const errorLine = setup.error && <div className="agent-account-note agent-setup-error">{copy.errors[setup.error]}</div>;

  if (!status.installed) {
    return (
      <div className="agent-account-row agent-setup-row">
        {phase === "installing" ? (
          <>
            <div className="agent-account-note">
              {setup.progress === null ? copy.finishing : copy.installing(setup.progress)}
            </div>
            <div className="usage-mbar agent-account-bar" role="progressbar" aria-valuenow={setup.progress ?? undefined}>
              <div className="usage-mbar-fill agent-account-fill" style={{ width: `${setup.progress ?? 100}%` }} />
            </div>
          </>
        ) : (
          <div className="agent-setup-actions">
            <div className="agent-account-note">
              {status.installable
                ? copy.installNote(label, Math.round((status.downloadBytes ?? 0) / 1_000_000))
                : copy.notInstallable}
            </div>
            {status.installable && (
              <button type="button" className="btn-primary btn-inline" onClick={setup.install}>
                {copy.install}
              </button>
            )}
          </div>
        )}
        {errorLine}
      </div>
    );
  }

  if (status.loggedIn === true) {
    return (
      <div className="agent-account-row agent-setup-row agent-account-kv">
        <span className="agent-account-label">{copy.connected(status.email)}</span>
        {status.plan && <span className="agent-account-value">{copy.plan(status.plan)}</span>}
      </div>
    );
  }

  if (phase === "connecting") {
    return (
      <div className="agent-account-row agent-setup-row">
        <div className="agent-account-note">{copy.connecting}</div>
        {setup.loginCode && <div className="agent-setup-code">{copy.typeCode(setup.loginCode)}</div>}
        {cli === "claude" && (
          <form
            className="agent-setup-actions"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) setup.submitCode(code);
              setCode("");
            }}
          >
            <label className="agent-account-note" htmlFor="agent-setup-code">
              {copy.pasteCode}
            </label>
            <input
              id="agent-setup-code"
              className="agent-setup-input"
              value={code}
              placeholder={copy.codePlaceholder}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" className="btn-primary btn-inline" disabled={!code.trim()}>
              {copy.submitCode}
            </button>
          </form>
        )}
        <div className="agent-setup-actions">
          {setup.loginUrl && (
            <a className="lnk" href={setup.loginUrl} target="_blank" rel="noreferrer">
              {copy.openPage}
            </a>
          )}
          <button type="button" className="lnk" onClick={setup.cancelLogin}>
            {copy.cancel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-account-row agent-setup-row">
      <div className="agent-setup-actions">
        <div className="agent-account-note">{copy.notConnected}</div>
        <button type="button" className="btn-primary btn-inline" onClick={login}>
          {copy.connect}
        </button>
      </div>
      {errorLine}
    </div>
  );
}
