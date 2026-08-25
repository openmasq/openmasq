import { app, safeStorage } from "electron";
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { encryptionAvailable } from "./safeStore";
import { safeUid } from "./keys";
import { BRAND } from "@openmasq/branding";

/**
 * UN secret de la synchro au repos, chiffré — le squelette que la phrase et le secret
 * d'appareil partagent.
 *
 * Extrait le jour où le second est arrivé : les deux tiennent une valeur unique, dans un
 * fichier `${userData}/<nom>.enc` (0600, base64), chiffré par `safeStorage` (trousseau de
 * l'OS / DPAPI) avec repli base64 EN CLAIR et un avertissement quand le chiffrement n'est
 * pas disponible. Deux copies auraient divergé au premier ajustement — et ce sont
 * précisément les fichiers où une divergence ne se voit pas.
 *
 * ⚠️ Ils vivent dans le processus PRINCIPAL, jamais dans le renderer : le localStorage de
 * Chromium est du LevelDB en clair sur le disque.
 */
export interface SecretFile {
  get(): string | null;
  set(value: string): void;
  clear(): void;
}

export function secretFile(name: string, label: string): SecretFile {
  const path = () => join(app.getPath("userData"), `${name}.enc`);
  return {
    get() {
      try {
        if (!existsSync(path())) return null;
        const buf = Buffer.from(readFileSync(path(), "utf8"), "base64");
        const s = encryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString("utf8");
        return s || null;
      } catch {
        return null;
      }
    },
    set(value: string) {
      const v = value.trim();
      if (!v) return this.clear();
      try {
        const enc = encryptionAvailable()
          ? safeStorage.encryptString(v).toString("base64")
          : (console.warn(`[sync] safeStorage unavailable — storing ${label} unencrypted`),
            Buffer.from(v, "utf8").toString("base64"));
        writeFileSync(path(), enc, { mode: 0o600 });
      } catch (err) {
        console.error(`[sync] failed to write ${name}.enc:`, err);
      }
    },
    clear() {
      try {
        if (existsSync(path())) rmSync(path());
      } catch (err) {
        console.error(`[sync] failed to clear ${name}.enc:`, err);
      }
    },
  };
}

export interface AccountSecretFile extends SecretFile {
  /** Re-scoper sur `uid` (connexion / CHANGEMENT de compte) ; `null` = déconnecté. */
  setUser(uid: string | null): void;
  /** Un compte est-il résolu ? Faux ⇒ rien ne se lit ni ne s'écrit sur le disque. */
  scoped(): boolean;
}

/**
 * Le MÊME secret, mais **par compte** — `${userData}/accounts/<nom>-<uid>.enc`.
 *
 * Le squelette est celui de `keys.ts` (isolation par compte, adoption unique de l'ancien
 * fichier partagé, uid assaini avant de toucher un chemin) parce que c'est le même problème :
 * une machine partagée ne doit jamais laisser le compte B se servir du secret de A. Recopier
 * ce squelette une troisième fois aurait été le bug avec plus de surface (règle 9) — d'où
 * cette variante ici, à côté de celle qui ne l'est pas.
 *
 * ⚠️ **Déconnecté, on n'écrit RIEN** (comme `keys.ts`) : pas de fichier « du compte inconnu »
 * qu'un compte suivant hériterait. Mais contrairement à `keys.ts`, `set()` **lève** dans ce
 * cas au lieu de ne rien faire en silence — poser une phrase de synchro est un geste dont
 * l'interface annonce le résultat, et un « c'est fait » qui n'a rien fait est précisément le
 * défaut qu'on corrige. `clear()` reste tolérant : effacer ce qui n'existe pas est un succès.
 */
export function accountSecretFile(name: string, label: string): AccountSecretFile {
  let uid: string | null = null;
  const accountsDir = () => join(app.getPath("userData"), "accounts");
  const legacyFile = () => join(app.getPath("userData"), `${name}.enc`);
  const marker = () => join(app.getPath("userData"), `.${BRAND.slug}-legacy-${name}-adopted`);
  const path = (): string | null => (uid ? join(accountsDir(), `${name}-${safeUid(uid)}.enc`) : null);

  /**
   * Adoption UNIQUE de l'ancien fichier partagé : il revient au PREMIER compte qui se
   * connecte après la mise à jour — son propriétaire dans l'immense majorité des cas, et
   * celui qui autrement perdrait sa phrase sans pouvoir la retrouver (aucun séquestre). Un
   * marqueur ferme la porte pour tous les autres, et l'ancien fichier est SUPPRIMÉ pour que
   * le secret partagé ne traîne plus. Même geste que `keys.ts` / `db/` / `mcp/persist.ts`.
   */
  const adoptLegacy = (): void => {
    const scoped = path();
    if (!scoped) return;
    try {
      if (existsSync(scoped)) return; // ce compte a déjà le sien
      if (existsSync(marker())) return; // déjà réclamé par un compte
      if (!existsSync(legacyFile())) {
        writeFileSync(marker(), "", { mode: 0o600 }); // rien à adopter — on ferme la porte
        return;
      }
      mkdirSync(accountsDir(), { recursive: true });
      copyFileSync(legacyFile(), scoped); // octets chiffrés : le même trousseau les rouvre
      writeFileSync(marker(), uid ?? "", { mode: 0o600 });
      try {
        unlinkSync(legacyFile());
      } catch {
        /* au mieux — le marqueur empêche déjà une seconde adoption */
      }
    } catch (e) {
      console.error(`[sync] legacy ${name} adoption failed:`, e);
    }
  };

  return {
    setUser(next) {
      uid = next == null ? null : safeUid(next) || null;
      if (uid) adoptLegacy();
    },
    scoped: () => !!uid,
    get() {
      const p = path();
      if (!p) return null;
      try {
        if (!existsSync(p)) return null;
        const buf = Buffer.from(readFileSync(p, "utf8"), "base64");
        const s = encryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString("utf8");
        return s || null;
      } catch {
        return null;
      }
    },
    set(value: string) {
      const v = value.trim();
      if (!v) return this.clear();
      const p = path();
      if (!p) throw new Error(`no account — refusing to store the ${label}`);
      try {
        mkdirSync(accountsDir(), { recursive: true });
        const enc = encryptionAvailable()
          ? safeStorage.encryptString(v).toString("base64")
          : (console.warn(`[sync] safeStorage unavailable — storing ${label} unencrypted`),
            Buffer.from(v, "utf8").toString("base64"));
        writeFileSync(p, enc, { mode: 0o600 });
      } catch (err) {
        console.error(`[sync] failed to write ${name}-<uid>.enc:`, err);
        throw err; // l'appelant DOIT pouvoir dire que ça n'a pas été posé
      }
    },
    clear() {
      const p = path();
      if (!p) return;
      try {
        if (existsSync(p)) rmSync(p);
      } catch (err) {
        console.error(`[sync] failed to clear ${name}-<uid>.enc:`, err);
        throw err; // idem : un « désactivé » qui n'a rien désactivé est un mensonge
      }
    },
  };
}
