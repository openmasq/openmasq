import { useCallback, useEffect, useRef, useState } from "react";
import type { SubscriptionCliStatus, SubscriptionSetupError } from "@openmasq/llm";
import { useHost } from "../host";
import type { AgentCli } from "./useAgentOptIns";

export type AgentSetupPhase = "idle" | "installing" | "connecting";

/**
 * Where a subscription CLI stands on this machine and the two gestures that move it:
 * INSTALL (the app downloads the pinned official build and lets it place itself) and
 * CONNECT (the CLI's own sign-in, relayed: a page to open, a code to type or to paste).
 * One hook for both surfaces that draw it (`AgentSetupRows` — Réglages → Modèles and
 * the onboarding), so the two never disagree about the state.
 *
 * `supported` is false on a host without the set-up slots (web preview, an
 * un-restarted preload): the rows then draw nothing and the older « install it
 * yourself » copy stands alone. The status is re-read after every finished gesture,
 * and a sign-in still running when the surface unmounts is cancelled — the CLI would
 * otherwise wait for a code nobody can give it any more.
 */
export interface AgentSetup {
  supported: boolean;
  /** `undefined` while loading; `null` when the host answered nothing. */
  status: SubscriptionCliStatus | null | undefined;
  phase: AgentSetupPhase;
  /** 0–100 while downloading; `null` once the CLI is placing itself. */
  progress: number | null;
  loginUrl: string | null;
  loginCode: string | null;
  error: SubscriptionSetupError | null;
  install(): void;
  login(): void;
  submitCode(code: string): void;
  cancelLogin(): void;
}

export function useAgentSetup(cli: AgentCli): AgentSetup {
  const host = useHost();
  const supported = !!host.readSubscriptionStatus && !!host.installSubscriptionCli && !!host.loginSubscriptionCli;
  const [status, setStatus] = useState<SubscriptionCliStatus | null | undefined>(undefined);
  const [phase, setPhase] = useState<AgentSetupPhase>("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [loginCode, setLoginCode] = useState<string | null>(null);
  const [error, setError] = useState<SubscriptionSetupError | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const refresh = useCallback(() => {
    const read = host.readSubscriptionStatus;
    if (!read) return;
    read
      .call(host, cli)
      .then((s) => setStatus(s))
      .catch(() => setStatus(null));
  }, [host, cli]);

  useEffect(() => {
    setStatus(undefined);
    refresh();
  }, [refresh]);

  useEffect(() => {
    const offProgress = host.onSubscriptionInstallProgress?.call(host, (p) => {
      if (p.cli !== cli) return;
      setProgress(p.phase === "download" && p.total > 0 ? Math.round((p.received / p.total) * 100) : null);
    });
    const offLogin = host.onSubscriptionLoginEvent?.call(host, (e) => {
      if (e.cli !== cli) return;
      if (e.kind === "url") setLoginUrl(e.url);
      else if (e.kind === "code") setLoginCode(e.code);
    });
    return () => {
      offProgress?.();
      offLogin?.();
      if (phaseRef.current === "connecting") void host.cancelSubscriptionLogin?.call(host, cli);
    };
  }, [host, cli]);

  const install = useCallback(() => {
    const run = host.installSubscriptionCli;
    if (!run || phaseRef.current !== "idle") return;
    setError(null);
    setProgress(0);
    setPhase("installing");
    run
      .call(host, cli)
      .then((r) => setError(r.ok ? null : (r.error ?? "install")))
      .catch(() => setError("install"))
      .finally(() => {
        setPhase("idle");
        setProgress(null);
        refresh();
      });
  }, [host, cli, refresh]);

  const login = useCallback(() => {
    const run = host.loginSubscriptionCli;
    if (!run || phaseRef.current !== "idle") return;
    setError(null);
    setLoginUrl(null);
    setLoginCode(null);
    setPhase("connecting");
    run
      .call(host, cli)
      .then((r) => setError(r.ok ? null : (r.error ?? "login")))
      .catch(() => setError("login"))
      .finally(() => {
        setPhase("idle");
        setLoginUrl(null);
        setLoginCode(null);
        refresh();
      });
  }, [host, cli, refresh]);

  const submitCode = useCallback(
    (code: string) => {
      void host.submitSubscriptionLoginCode?.call(host, cli, code);
    },
    [host, cli],
  );
  const cancelLogin = useCallback(() => {
    void host.cancelSubscriptionLogin?.call(host, cli);
  }, [host, cli]);

  return { supported, status, phase, progress, loginUrl, loginCode, error, install, login, submitCode, cancelLogin };
}
