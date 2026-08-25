import { Btn } from "../McpBtn";
import type { McpConnector } from "@openmasq/catalog/mcp";
import { BRAND } from "@openmasq/branding";

/**
 * A desktop-DIRECT connector that isn't connected yet: the app's own one-click
 * OAuth, and/or "Mes clés" (BYO client id/secret, stored encrypted on this
 * machine). Which pair shows is the connector's own declaration — `byoOnly`
 * connectors have no first-party app, Slack's flow is broker-only. An `adminConsent`
 * connector keeps BOTH (the first-party app is multi-tenant, so an admin can approve it) and
 * says so up front.
 */
export function McpDirectBody({
  connector,
  hasCreds,
  busy,
  onByo,
  onConnectDirect,
}: {
  connector: McpConnector;
  hasCreds?: boolean;
  busy: boolean;
  onByo: () => void;
  onConnectDirect: () => void;
}) {
  return (
    <>
      {hasCreds && (
        <p className="mcp-modal-note">
          Vos identifiants sont déjà enregistrés sur cette machine — « Mes clés » permet de
          les réutiliser ou de les remplacer.
        </p>
      )}
      {connector.adminConsent && (
        // Said BEFORE the click, not discovered as a failure: a member who is not an admin
        // would otherwise read Microsoft's refusal as "l'app est cassée". The one-off,
        // org-wide nature is the point — it is what makes this a five-minute approval
        // rather than an integration project.
        <p className="mcp-modal-note">
          Première connexion dans votre organisation&nbsp;: un administrateur doit approuver
          {BRAND.name} une seule fois, pour tout le monde. Si vous ne l&apos;êtes pas, lancez la
          connexion&nbsp;: {BRAND.name} vous donnera le lien à lui transmettre.
        </p>
      )}
      <div className="mcp-modal-actions">
        {connector.byoOnly ? (
          <Btn
            label={busy ? "Connexion…" : hasCreds ? "Reconnecter" : "Mes clés"}
            onClick={onByo}
            disabled={busy}
            loading={busy}
          />
        ) : connector.directAuth === "slack" ? (
          <Btn label={busy ? "Connexion…" : "Connecter"} onClick={onConnectDirect} disabled={busy} loading={busy} />
        ) : connector.byoAdds ? (
          // The app's 1-clic covers only PART of this connector, so "Mes clés" leads:
          // it is the mode that actually does what the user came for. The 1-clic stays
          // one click away, but must not present itself as the complete option.
          <>
            <Btn
              label={busy ? "Connexion…" : "Connecter (limité)"}
              onClick={onConnectDirect}
              disabled={busy}
              loading={busy}
              subtle
              title={`Sans vos clés, ${BRAND.name} ne peut pas ${connector.byoAdds}.`}
            />
            <Btn label="Mes clés" onClick={onByo} disabled={busy} />
          </>
        ) : (
          <>
            <Btn label="Mes clés" onClick={onByo} disabled={busy} subtle />
            <Btn label={busy ? "Connexion…" : "Connecter"} onClick={onConnectDirect} disabled={busy} loading={busy} />
          </>
        )}
      </div>
    </>
  );
}
