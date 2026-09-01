import { Component, type ReactNode } from "react";
import { getMessages } from "@openmasq/i18n";
import { initialLocale } from "../../state/locale";

/**
 * Catches any render-time throw in the app tree and shows a recoverable error
 * card instead of React unmounting the whole tree → a blank white screen (there
 * was no boundary before, so a single failure blanked the app). Class component
 * because `componentDidCatch` / `getDerivedStateFromError` have no hook form.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Surface in the console for diagnosis; the fallback UI stays user-friendly.
    // ⚠️ The COMPONENT stack is the half that names the culprit: on a minified build the
    // JS stack is all React internals (« destroy is not a function » pointed nowhere for
    // a whole debugging session) while the component names survive minification.
    console.error("[app] render error caught by ErrorBoundary:", error, info?.componentStack ?? "");
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // A CLASS can't read the i18n context via a hook, and the fallback must stay
    // as dumb as possible: it's the screen shown when everything else has failed.
    // The device's language is enough — the provider may well have vanished with the tree.
    const t = getMessages(initialLocale()).leaves.errorBoundary;
    return (
      <div className="app app-error">
        <div className="app-error-card">
          <h1 className="cv-display app-error-title">{t.title}</h1>
          <p className="app-error-text">{t.body}</p>
          <p className="app-error-detail">{error.message}</p>
          <div className="app-error-actions">
            <button
              className="btn-primary"
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
            >
              {t.reload}
            </button>
            <button className="btn-ghost" onClick={() => this.setState({ error: null })}>
              {t.retry}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
