import { useCallback, useEffect, useRef, useState } from "react";
import { cliAuthOf, type SubscriptionCli } from "@openmasq/llm";
import type { Host } from "../../host";
import type { CliReadiness } from "../../send/modelAvailability";

/**
 * Is a subscription CLI still SIGNED IN? Read from its own status (`subscription:status`,
 * which runs the CLI's `auth status` — a spawn, so never on a render or a keystroke): once
 * when the CLI becomes usable, then on window focus at most once a minute. Two cheaper
 * sources update it without any spawn: a sign-in that just succeeded (the CLI's own
 * `login-event` `done`), and `noteCliSession` — a turn the CLI refused for its session,
 * or the reconnect card that just read a fresh status.
 *
 * `null` = unknown (status unanswered, no status command, host without the slot): it
 * NEVER blocks. Only a KNOWN `false` makes the model `"signed_out"`.
 */
const STATUS_TTL_MS = 60_000;

type SessionListener = (cli: SubscriptionCli, loggedIn: boolean | null) => void;
const listeners = new Set<SessionListener>();

/** Tell every mounted probe what this CLI's session is NOW — no spawn. */
export function noteCliSession(cli: SubscriptionCli, loggedIn: boolean | null): void {
  for (const listener of listeners) listener(cli, loggedIn);
}

/** A turn failed: if the CLI refused it for its SESSION (`CLI_AUTH:<cli>` from main), the
 *  picker and the gate learn it now — the next send is refused before any spawn. */
export function noteCliAuthFailure(raw: string): void {
  const cli = cliAuthOf(raw);
  if (cli) noteCliSession(cli, false);
}

/** `active` = opt-in on AND binary found. Pure, so the availability table is testable. */
export function cliReadiness(active: boolean, loggedIn: boolean | null): CliReadiness {
  if (!active) return false;
  return loggedIn === false ? "signed_out" : true;
}

export function useCliSession(host: Host, cli: SubscriptionCli, active: boolean) {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  // Mirrored in a ref, written in the SAME call: a regenerate fired right after a note
  // reads the gate through it, before React re-renders.
  const loggedInRef = useRef<boolean | null>(null);
  const apply = useCallback((v: boolean | null) => {
    loggedInRef.current = v;
    setLoggedIn(v);
  }, []);

  useEffect(() => {
    const read = host.readSubscriptionStatus;
    if (!active || !read) {
      apply(null);
      return;
    }
    let cancelled = false;
    let last = 0;
    const check = () => {
      if (Date.now() - last < STATUS_TTL_MS) return;
      last = Date.now();
      read
        .call(host, cli)
        .then((s) => !cancelled && apply(s?.loggedIn ?? null))
        .catch(() => !cancelled && apply(null));
    };
    check();
    window.addEventListener("focus", check);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", check);
    };
  }, [host, cli, active, apply]);

  useEffect(() => {
    const onNote: SessionListener = (c, v) => {
      if (c === cli) apply(v);
    };
    listeners.add(onNote);
    // The CLI's own sign-in exited 0 — Réglages, the onboarding or the reconnect card.
    const off = host.onSubscriptionLoginEvent?.call(host, (e) => {
      if (e.cli === cli && e.kind === "done" && e.ok) apply(true);
    });
    return () => {
      listeners.delete(onNote);
      off?.();
    };
  }, [host, cli, apply]);

  return { loggedIn, loggedInRef };
}
