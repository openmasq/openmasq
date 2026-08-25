import { reportedLedger } from "@openmasq/sync";
import { BRAND } from "@openmasq/branding";
import { authHost } from "../auth";

/**
 * Le journal de dédoublonnage de l'audit d'organisation — PAR COMPTE et SANS valeur en
 * clair. La table de faits d'une organisation étant append-only, une valeur redacted ne
 * doit être comptée qu'une fois ; ce journal dit ce qui l'a déjà été.
 *
 * ⚠️ Il vivait sous UNE clé d'appareil et il stockait les ORIGINAUX. Deux défauts : ce que
 * le compte A avait rapporté empêchait l'organisation de B de compter les siennes, et de la
 * vraie PII dormait en clair dans le localStorage — du LevelDB Chromium sur le disque,
 * c'est-à-dire l'endroit d'où la phrase de synchro et le secret d'appareil ont justement été
 * retirés. La politique (empreinte salée, clé par compte, migration du clair dès le premier
 * chargement) vit dans `@openmasq/sync` `reportedLedger`, partagée avec mobile et
 * l'extension et testée là-bas.
 */
const ledger = reportedLedger({
  store: {
    get: async (key) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set: async (key, value) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* quota / stockage indisponible — le delta sera simplement re-rapporté */
      }
    },
    remove: async (key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  },
  legacyKey: `${BRAND.slug}:sync-reported`,
  // Le `sub` du jeton, décodé SANS vérification : ici c'est un nom de casier local, jamais
  // une autorité — l'identité qui compte est celle que le backend re-dérive du jeton.
  accountId: async () => {
    try {
      const token = await authHost.getAccessToken?.();
      if (!token) return null;
      const payload = JSON.parse(
        atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      ) as { sub?: string };
      return typeof payload.sub === "string" ? payload.sub : null;
    } catch {
      return null;
    }
  },
});

export const openReported = (): ReturnType<typeof ledger.open> => ledger.open();
