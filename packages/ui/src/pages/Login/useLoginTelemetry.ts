import { useEffect } from "react";
import { captureEvent } from "../../analytics";
import { loginFailure, type LoginMethod, type LoginStep } from "./loginErrors";

/**
 * What the sign-in screen tells PostHog. Without it, the screen before the onboarding is a
 * blank: an `app_open` with nothing after it cannot say whether the person never tried, was
 * refused, or is still waiting for the email. Enums only: the address and the server's text
 * never reach an event.
 */
export function useLoginTelemetry(step: LoginStep) {
  useEffect(() => {
    captureEvent({ name: "login_step", step });
  }, [step]);

  return (method: LoginMethod, error?: unknown) =>
    captureEvent({ name: "login_result", method, outcome: error ? loginFailure(error) : "ok" });
}
