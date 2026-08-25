import type { ElectronApplication, Page } from "@playwright/test";

/**
 * LE PONT MCP DE TEST — parler aux VRAIS connecteurs du compte connecté, depuis un
 * test, sans passer par le modèle : le preload expose déjà `mcp.listTools` /
 * `mcp.callTool`, et l'app lancée porte les connexions du compte (store adopté).
 * Sert à (a) préparer un scénario, (b) VÉRIFIER l'effet réel d'un workflow (« le
 * message est-il parti UNE fois ? »), (c) écrire un test d'outil sans LLM.
 * ⚠️ Aucun gate n'est contourné : une écriture risquée ouvre la MÊME fenêtre
 * système non-spoofable — d'où `startSelectiveApprove` en parallèle si besoin.
 */
export function realMcp(page: Page) {
  // ⚠️ Tout ce qui suit s'exécute DANS la page : la fonction passée à `evaluate`
  // est sérialisée, elle ne peut donc capturer aucune variable de ce module.
  const list = (): Promise<{ name: string; description?: string }[]> =>
    page
      .evaluate(() =>
        (
          window as unknown as {
            openmasq: { mcp: { listTools: () => Promise<{ name: string; description?: string }[]> } };
          }
        ).openmasq.mcp.listTools(),
      )
      .catch(() => [] as { name: string; description?: string }[]);
  return {
    listTools: list,
    /** Noms d'outils d'un connecteur donné (préfixe `<id>__`). */
    toolsOf: async (connectorId: string) =>
      (await list()).map((t) => t.name).filter((n) => n.startsWith(`${connectorId}__`)),
    call: (name: string, args: Record<string, unknown> = {}) =>
      page.evaluate(
        ({ name, args }) =>
          (
            window as unknown as {
              openmasq: { mcp: { callTool: (c: { name: string; args?: unknown }) => Promise<unknown> } };
            }
          ).openmasq.mcp.callTool({ name, args }),
        { name, args },
      ),
  };
}

/**
 * Approbateur SÉLECTIF de la fenêtre main non-spoofable, avec comptage PAR OUTIL —
 * les deux assertions de la suite vivent ici :
 *   • `refuse` (ex. /^neon__/) → clic « Refuser » (sentinelle write-deny) : aucune
 *     écriture de ces outils ne s'exécute, et on le PROUVE (compteur `refused`) ;
 *   • tout le reste → « Autoriser » (UN appel — jamais « Toujours pour cet outil »),
 *     donc 1 confirmation = 1 exécution : le compteur `approved` par outil est la
 *     mesure ANTI-DOUBLE-ENVOI (le bug « 2 mails » du dossier tofix = 2 confirmations).
 * Le nom d'outil est lu dans le DOM de la fenêtre (main l'y écrit — `writeConfirmHtml`).
 */
export function startSelectiveApprove(
  app: ElectronApplication,
  page: Page,
  refuse: RegExp | null,
) {
  let stop = false;
  const approved = new Map<string, number>();
  const refused = new Map<string, number>();
  const bump = (m: Map<string, number>, tool: string) => m.set(tool, (m.get(tool) ?? 0) + 1);
  const loop = (async () => {
    while (!stop) {
      try {
        // La carte in-conversation (gestes locaux réversibles) : approuver.
        const cardBtn = page.locator(".write-confirm-card .btn-danger");
        if ((await cardBtn.count().catch(() => 0)) > 0)
          await cardBtn.first().click({ timeout: 1_000 }).catch(() => {});
        for (const w of app.windows()) {
          if (w === page) continue;
          const allow = w.locator('a[href="https://example.invalid/write-allow"]');
          if ((await allow.count().catch(() => 0)) === 0) continue;
          const body = (await w.locator("body").innerText().catch(() => "")) ?? "";
          const tool = /([a-z0-9-]+__[a-zA-Z0-9_-]+)/.exec(body)?.[1] ?? "?";
          if (refuse?.test(tool)) {
            await w
              .locator('a[href="https://example.invalid/write-deny"]')
              .first()
              .click({ timeout: 1_000 })
              .then(() => bump(refused, tool))
              .catch(() => {});
          } else {
            await allow
              .first()
              .click({ timeout: 1_000 })
              .then(() => bump(approved, tool))
              .catch(() => {});
          }
        }
      } catch {
        /* une fenêtre peut se fermer en plein poll — on continue */
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  })();
  return {
    approved: () => new Map(approved),
    refused: () => new Map(refused),
    stop: async () => {
      stop = true;
      await loop;
    },
  };
}
