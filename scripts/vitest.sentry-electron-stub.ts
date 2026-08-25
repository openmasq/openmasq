/**
 * `@sentry/electron/{main,renderer}` vus par la SUITE UNITAIRE — un bouchon, même
 * contrat que `vitest.electron-stub.ts` (lire son en-tête : la course au téléchargement).
 *
 * Le vrai paquet ne peut PAS vivre ici : externalisé, son import interne d'`electron`
 * contourne l'alias (résolveur Node) et touche le module-chaîne ; inliné, son init de
 * module lit `process.versions.electron` et jette hors Electron. Or il est importé par
 * des fichiers du MAIN que la suite teste (`runtime/errorReport.ts`, `sentry/main.ts`).
 *
 * Chaque fonction JETTE à l'appel en dictant le `vi.mock` à écrire : un test qui touche
 * réellement Sentry doit le déclarer — un no-op silencieux ferait passer pour vert un
 * chemin d'erreur qui ne rapporte rien.
 */
const boom = (name: string) => (): never => {
  throw new Error(
    `@sentry/electron.${name} — la suite unitaire n'a PAS Sentry (bouchon : ` +
      `scripts/vitest.sentry-electron-stub.ts). Déclarez ce dont ce test a besoin :\n` +
      `  vi.mock("@sentry/electron/main", () => ({ ${name}: vi.fn() }));`,
  );
};

export const init = boom("init");
export const captureException = boom("captureException");
export const captureMessage = boom("captureMessage");
export const setUser = boom("setUser");
export const setTag = boom("setTag");
export const addBreadcrumb = boom("addBreadcrumb");
export const flush = boom("flush");
export const close = boom("close");
export const getClient = boom("getClient");
// Les fabriques d'intégrations sont interrogées à l'ASSEMBLAGE de la config (avant tout
// `init`) : elles rendent un marqueur inerte plutôt que de jeter — c'est `init` qui jette.
export const childProcessIntegration = () => ({ name: "stub:childProcess" });
export const linkedErrorsIntegration = () => ({ name: "stub:linkedErrors" });
export const normalizePathsIntegration = () => ({ name: "stub:normalizePaths" });
export const onUncaughtExceptionIntegration = () => ({ name: "stub:onUncaughtException" });
export const onUnhandledRejectionIntegration = () => ({ name: "stub:onUnhandledRejection" });
export const browserTracingIntegration = () => ({ name: "stub:browserTracing" });
