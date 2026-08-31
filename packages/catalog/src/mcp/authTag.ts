import { BRAND } from "@openmasq/branding";
import type { McpConnector, McpAuthTag } from "./types";

/**
 * The auth model of a connector — the SINGLE source both the desktop Settings and the
 * admin console show, so "how do I connect this?" reads the same on both surfaces.
 * Derived from `transport` + `auth`, refined by the BYO fields (see `mcpAuthTag`).
 *
 * ⚠️ This copy is read by someone deciding whether to hand the app their mailbox. Write
 * it for THEM: say what happens when they click and what it will (not) be able to do.
 * No protocol names — "OAuth loopback + PKCE", "DCR", "CASA", "client public" are our
 * vocabulary, not theirs, and a word nobody understands cannot inform a decision. The
 * fact still has to be exact: vague is not the same as friendly.
 */

/** What a one-click connection actually feels like, when the app's own client covers it. */
const DIRECT_FULL =
  "La page de connexion du service s'ouvre : vous acceptez, et c'est fini. Rien à copier-coller, aucune clé à créer.";

/** The reassurance that BYO changes nothing about where the data goes. */
const BYO_SAFE = `Vos identifiants restent chiffrés sur votre appareil et ne passent par aucun serveur ${BRAND.name}.`;

/**
 * Why "Mes clés" is the way in — the connector's OWN reason, never a generic one.
 *
 * `casa` is an app-side, temporary blocker, so it may honestly say the work is under
 * way; `admin-consent` is the tenant admin's call and will never become one-click, so
 * it must NOT borrow that hope. Pinned by `authTag.test.ts`.
 */
function byoReasonText(c: Pick<McpConnector, "byoReason">): string {
  return c.byoReason === "admin-consent"
    ? "seul un administrateur de votre organisation peut l'autoriser"
    : `Google vérifie encore ${BRAND.name} avant d'ouvrir cet accès en un clic (en cours)`;
}

/** The SHAPE of a connector's auth story — every branch `mcpAuthTag` renders, without
 *  the words. The desktop UI renders the same shape from its language catalogue
 *  (`@openmasq/i18n` `connectorCatalog.auth`), so the two can never disagree on WHICH
 *  story a connector tells — only on the language it is told in. */
export type McpAuthVariant =
  | "builtin"
  | "byoOnly"
  | "byoLimited"
  | "device"
  | "directFull"
  | "local"
  | "broker"
  | "apikey"
  | "oneClickRemote";

export interface McpAuthShape {
  kind: McpAuthTag["kind"];
  variant: McpAuthVariant;
  /** `byoAdds` verbatim when set — what the one-click does NOT cover. */
  what?: string;
  /** Why "Mes clés" is the way in (BYO variants only). */
  reason?: "admin-consent" | "google-review";
}

export function mcpAuthShape(
  c: Pick<McpConnector, "transport" | "auth" | "directAuth" | "byoOnly" | "byoReason" | "byoAdds">,
): McpAuthShape {
  if (c.transport === "builtin") return { kind: "builtin", variant: "builtin" };
  if (c.transport === "direct") {
    const reason = c.byoReason === "admin-consent" ? "admin-consent" : "google-review";
    // No first-party client at all → do NOT advertise a one-click that isn't offered: the
    // modal only shows "Mes clés" here, and the chip must agree with the buttons.
    if (c.byoOnly) return { kind: "direct", variant: "byoOnly", what: c.byoAdds, reason };
    // A first-party client that covers only PART of the connector (Gmail: it sends, it
    // cannot read). The plain one-click line alone would overstate what you get.
    if (c.byoAdds) return { kind: "direct", variant: "byoLimited", what: c.byoAdds, reason };
    return { kind: "direct", variant: c.directAuth === "device" ? "device" : "directFull" };
  }
  if (c.transport === "stdio") return { kind: "local", variant: "local" };
  if (c.transport === "broker") return { kind: "broker", variant: "broker" };
  if (c.auth === "apikey") return { kind: "apikey", variant: "apikey" };
  return { kind: "oneclick", variant: "oneClickRemote" };
}

export function mcpAuthTag(
  c: Pick<McpConnector, "transport" | "auth" | "directAuth" | "byoOnly" | "byoReason" | "byoAdds">,
): McpAuthTag {
  if (c.transport === "builtin") {
    return {
      kind: "builtin",
      label: "Intégré",
      title:
        "Fourni avec l'application : rien à connecter, rien à payer, aucun compte à relier. Il suffit de l'activer.",
    };
  }
  if (c.transport === "direct") {
    const what = c.byoAdds ?? "cet accès";
    // No first-party client at all → do NOT advertise a one-click that isn't offered: the
    // modal only shows "Mes clés" here, and the chip must agree with the buttons.
    if (c.byoOnly) {
      return {
        kind: "direct",
        label: "Vos clés",
        title: `Pour ${what}, vos propres clés sont nécessaires — ${byoReasonText(c)}. ${BYO_SAFE}`,
      };
    }
    // A first-party client that covers only PART of the connector (Gmail: it sends, it
    // cannot read). The plain one-click line alone would overstate what you get.
    if (c.byoAdds) {
      return {
        kind: "direct",
        label: "1-clic limité",
        title: `Connexion en un clic, rien à créer. Pour ${what}, vos propres clés seront nécessaires — ${byoReasonText(c)}.`,
      };
    }
    return {
      kind: "direct",
      label: c.directAuth === "device" ? "Appareil" : "1-clic",
      title:
        c.directAuth === "device"
          ? "Un code à saisir sur le site du service, et c'est fini. Aucune clé à créer."
          : DIRECT_FULL,
    };
  }
  if (c.transport === "stdio") {
    return {
      kind: "local",
      label: "Local",
      title:
        "Cet outil tourne sur votre machine : vos dossiers et vos identifiants restent chez vous, et ne sont jamais envoyés au modèle.",
    };
  }
  if (c.transport === "broker") {
    return {
      kind: "broker",
      label: `Via ${BRAND.name}`,
      title: `Vous vous connectez à votre compte, et ${BRAND.name} s'occupe du reste : rien à créer, aucun code à coller.`,
    };
  }
  if (c.auth === "apikey") {
    return {
      kind: "apikey",
      label: "Clé requise",
      title:
        "Ce service demande une clé, à récupérer sur son site puis à coller ici. Il n'y a pas de page de connexion.",
    };
  }
  return {
    kind: "oneclick",
    label: "1-clic",
    title:
      "La page de connexion du service s'ouvre dans votre navigateur : vous acceptez, et c'est fini. Rien à créer.",
  };
}
