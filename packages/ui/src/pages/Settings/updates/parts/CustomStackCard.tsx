import { useState } from "react";
import { LayersIcon } from "../../../../components/brand";
import { useHost } from "../../../../host";
import type { CustomStack } from "../../../../host";
import { useT } from "../../../../i18n/I18nProvider";
import { customStackRefusalKey } from "./customStackView";

// La carte PILE AUTO-HÉBERGÉE du tab Versions — présente SEULEMENT quand le build honore
// une pile saisie (`host.env.customStack`, absent du binaire officiel). Quatre champs, un
// bouton. L'écran ne décide de rien : la validation se rejoue dans le processus
// privilégié, qui ouvre une boîte de dialogue NATIVE avant d'écrire, puis redémarre l'app
// dans un profil séparé. Un refus est montré tel quel, jamais un silence.
//
// Toute la copie vient du catalogue (`t.selfHost.*`) : fichier neuf, cliquet i18n.

const EMPTY: CustomStack = { backend: "", gateway: "", supabaseUrl: "", supabaseAnonKey: "" };

export function CustomStackCard() {
  const host = useHost();
  const t = useT();
  const stackHost = host.env?.customStack;
  const [form, setForm] = useState<CustomStack>(stackHost?.current ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!stackHost) return null;

  const set = (k: keyof CustomStack) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onApply = async () => {
    setBusy(true);
    setErr(null);
    const r = await stackHost.set(form).catch(() => null);
    // ok ⇒ l'app redémarre : rien à rendre. Tout le reste se dit.
    if (!r || !r.ok) {
      setErr(t.selfHost.refusal[customStackRefusalKey(r)]);
      setBusy(false);
    }
  };

  const onForget = async () => {
    setBusy(true);
    setErr(null);
    const r = await stackHost.forget().catch(() => null);
    if (!r || !r.ok) {
      setErr(t.selfHost.refusal[customStackRefusalKey(r)]);
      setBusy(false);
    }
  };

  const currentHost = (() => {
    try {
      return stackHost.current ? new URL(stackHost.current.backend).host : null;
    } catch {
      return stackHost.current?.backend ?? null;
    }
  })();

  const field = (k: keyof CustomStack, label: string, hint?: string) => (
    <label className="flex flex-col gap-1 text-xs text-muted">
      <span>
        {label}
        {hint && <span className="ml-1 opacity-70">({hint})</span>}
      </span>
      <input
        type="text"
        value={form[k]}
        onChange={set(k)}
        disabled={busy}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="mcp-url-input"
      />
    </label>
  );

  return (
    <section className="mb-6">
      <div className="cv-eyebrow ver-eyebrow">{t.selfHost.eyebrow}</div>
      <div className="settings-card">
        <div className="flex items-start gap-3.5 px-[18px] py-4">
          <span className="ver-now-mark">
            <LayersIcon size={22} />
          </span>
          <div className="flex-min flex flex-col gap-3">
            <div>
              <div className="ver-now-name">{t.selfHost.title}</div>
              <div className="ver-now-chan">{t.selfHost.body}</div>
            </div>
            {field("backend", t.selfHost.backend)}
            {field("gateway", t.selfHost.gateway, t.selfHost.gatewayOptional)}
            {field("supabaseUrl", t.selfHost.supabaseUrl)}
            {field("supabaseAnonKey", t.selfHost.supabaseAnonKey)}
            <div className="flex items-center gap-3">
              <button type="button" onClick={onApply} disabled={busy} className="ver-btn">
                <span className="om-sweep">{busy ? t.selfHost.applying : t.selfHost.apply}</span>
              </button>
              {stackHost.current && (
                <button type="button" onClick={onForget} disabled={busy} className="text-xs text-muted underline">
                  {t.selfHost.forget}
                </button>
              )}
            </div>
            {currentHost && <div className="text-xs text-muted">{t.selfHost.current(currentHost)}</div>}
          </div>
        </div>
      </div>
      {err && (
        <div className="ver-note ver-note-after">
          <span className="ver-note-icon">{"\u{1F512}"}</span>
          <span>{err}</span>
        </div>
      )}
    </section>
  );
}
