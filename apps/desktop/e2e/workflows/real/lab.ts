import { expect, type Page } from "@playwright/test";

/*
 * Le LABORATOIRE : N tours agentiques CONCURRENTS dans UNE app lancée.
 *
 * Le coût d'un test « connecteurs réels » se répartit en trois : le démarrage de
 * l'app (~30 s), la reconnexion des connecteurs, et les tours de modèle (les
 * minutes). Un test = une app payait le premier deux fois pour rien et sérialisait
 * le troisième. Ici : UNE app, N conversations lancées ensemble, on attend le lot.
 * Le temps du lot ≈ le tour le plus lent, pas leur somme.
 *
 * Ce qui est exécuté reste le PROCESSUS EXACT de l'app : `sendMessage` du store →
 * redaction → wire → `mcpAgent` → vrais connecteurs MCP → les deux gates. Le pont
 * ne substitue que la réponse des cartes de confirmation (voir `e2eBridge.tsx`).
 */

/** Le contrat du pont, redéclaré ici : le spec et le renderer ne partagent pas de
 *  tsconfig. Il doit rester le miroir de `src/renderer/src/e2eBridge.tsx` — une
 *  dérive se voit tout de suite (le pont est le SEUL consommateur). */
interface E2eTurnSnapshot {
  convId: string;
  done: boolean;
  text: string;
  error: boolean;
  errorText: string;
  tools: string[];
  redactions: Record<string, string>;
  ms: number;
}
declare global {
  interface Window {
    __openmasqE2E?: {
      send: (
        text: string,
        opts?: { approveWrites?: boolean; revealForWeb?: boolean; modelId?: string },
      ) => string;
      modelReady: (id: string) => boolean;
      turn: (convId: string) => E2eTurnSnapshot | null;
      confirms: () => {
        tool: string;
        convId: string;
        approved: boolean;
        at: number;
        args: Record<string, unknown>;
      }[];
      journal: (convId: string) => unknown[];
      toolNameRedactions: (convId: string) => { fake: string; real: string }[];
    };
  }
}

export interface LabPrompt {
  id: string;
  prompt: string;
  /**
   * Autoriser les écritures de CE tour. **Absent = REFUSÉES** — un banc qui tourne sur
   * les VRAIS comptes approuve par exception, jamais par défaut.
   *
   * Le défaut inverse a coûté exactement ce qu'il promettait : sur `prep-journee`, un
   * scénario annoté « Lecture seule », le modèle a créé un événement inventé dans
   * l'agenda réel — approuvé sans que personne ne l'ait demandé, et compté comme un
   * succès (journal du 27/07/2026). Un scénario qui VEUT écrire le déclare.
   */
  approveWrites?: boolean;
  /** Modèle de CE tour — comparer deux modèles dans un même lot. */
  modelId?: string;
}

export interface LabResult extends LabPrompt {
  convId: string;
  done: boolean;
  timedOut: boolean;
  error: boolean;
  errorText: string;
  text: string;
  /** Les outils réellement appelés, dans l'ordre — la matière du diagnostic. */
  tools: string[];
  /** La boucle a-t-elle été COUPÉE par le plafond d'appels ? (le symptôme n°1 :
   *  le modèle rejoue le même outil au lieu de changer d'approche). */
  loopStopped: boolean;
  /** Le plus grand nombre de fois qu'UN même outil a été appelé dans ce tour —
   *  la métrique de qualité de guidance : elle doit BAISSER quand on l'améliore. */
  maxRepeat: number;
  /** Noms d'outils / termes techniques redacted PAR ERREUR dans les résultats de
   *  découverte (`execute-sql → jade-tom`). Non vide = la boucle est (au moins en
   *  partie) INDUITE PAR LE REDACTION, pas une faiblesse du modèle — la distinction
   *  qui rend le chiffre de fiabilité interprétable. */
  toolRedactions: { fake: string; real: string }[];
  ms: number;
}

/** L'app annonce elle-même l'interruption dans la réponse — s'appuyer sur son
 *  texte (et non deviner) garde le test aligné sur `mcpAgentGuidance`. */
const LOOP_STOPPED = /Boucle d'outils interrompue/i;

const maxRepeatOf = (tools: string[]): number => {
  const n = new Map<string, number>();
  for (const t of tools) n.set(t, (n.get(t) ?? 0) + 1);
  return Math.max(0, ...n.values());
};

/** Le pont est monté de façon asynchrone (drapeau demandé à main) — l'attendre. */
export async function waitForBridge(page: Page): Promise<void> {
  await page.waitForFunction(() => !!window.__openmasqE2E, null, { timeout: 30_000 });
}

/**
 * Lance tous les prompts d'un coup, puis attend que chacun soit terminé.
 * `timeoutMs` s'applique au LOT (un tour bloqué n'immobilise pas les autres — il
 * ressort `timedOut`, ce qui EST le symptôme qu'on cherche à mesurer).
 */
export async function runLab(
  page: Page,
  prompts: LabPrompt[],
  opts: { modelId: string; timeoutMs?: number },
): Promise<LabResult[]> {
  const timeoutMs = opts.timeoutMs ?? 300_000;
  await waitForBridge(page);
  // Le catalogue OpenRouter DYNAMIQUE est fusionné au montage : sans cette
  // attente, un slug dynamique n'est pas résolvable et le send part sur le
  // modèle d'usine (401 avec notre session factice).
  await page.waitForFunction((id) => window.__openmasqE2E!.modelReady(id), opts.modelId, {
    timeout: 60_000,
  });
  const started = await page.evaluate(
    ({ list, modelId }) =>
      list.map((p) => ({
        id: p.id,
        convId: window.__openmasqE2E!.send(p.prompt, {
          approveWrites: p.approveWrites === true,
          modelId: p.modelId ?? modelId,
        }),
      })),
    { list: prompts, modelId: opts.modelId },
  );

  const deadline = Date.now() + timeoutMs;
  let snapshot: Record<string, ReturnType<NonNullable<Window["__openmasqE2E"]>["turn"]>> = {};
  for (;;) {
    snapshot = await page.evaluate(
      (ids) => Object.fromEntries(ids.map((c) => [c, window.__openmasqE2E!.turn(c)])),
      started.map((s) => s.convId),
    );
    if (Object.values(snapshot).every((t) => t?.done)) break;
    if (Date.now() > deadline) break;
    await page.waitForTimeout(2_000);
  }

  // Les redactions de NOMS D'OUTILS par conversation (le journal de débogage).
  const toolReds = await page.evaluate(
    (ids) => Object.fromEntries(ids.map((c) => [c, window.__openmasqE2E!.toolNameRedactions(c)])),
    started.map((s) => s.convId),
  );

  return prompts.map((p) => {
    const convId = started.find((s) => s.id === p.id)!.convId;
    const t = snapshot[convId];
    return {
      ...p,
      convId,
      done: !!t?.done,
      timedOut: !t?.done,
      error: !!t?.error,
      errorText: t?.errorText ?? "",
      text: t?.text ?? "",
      tools: t?.tools ?? [],
      loopStopped: LOOP_STOPPED.test(t?.text ?? ""),
      maxRepeat: maxRepeatOf(t?.tools ?? []),
      toolRedactions: toolReds[convId] ?? [],
      ms: t?.ms ?? 0,
    };
  });
}

/** Vider le journal du bench dans un fichier (pour l'autopsie d'un workflow qui
 *  boucle) — le journal COMPLET, avec les correspondances redacted↔original. */
export async function dumpJournal(page: Page, convId: string): Promise<unknown[]> {
  return page.evaluate((c) => window.__openmasqE2E!.journal(c), convId);
}

/** Les confirmations d'écriture demandées par la boucle, tous tours confondus —
 *  `2×` sur un même outil dans une même conversation EST le double-envoi. */
export async function labConfirms(page: Page) {
  return page.evaluate(() => window.__openmasqE2E!.confirms());
}

/** Un rapport compact, lisible d'un coup d'œil dans la sortie Playwright. */
export function labReport(results: LabResult[]): string {
  return results
    .map((r) => {
      const state = r.timedOut ? "⏳ BLOQUÉ" : r.error ? "✗ ERREUR" : r.loopStopped ? "🔁 BOUCLE" : "✓";
      const tools = r.tools.length
        ? ` · ${r.tools.length} appel(s) [max ${r.maxRepeat}× le même]: ${[...new Set(r.tools)].join(", ")}`
        : " · aucun outil";
      // Le drapeau qui rend la boucle interprétable : redaction OU modèle.
      const redact = r.toolRedactions.length
        ? `\n    ⚠️ NOMS D'OUTILS REDACTED (cause probable de boucle) : ${r.toolRedactions
            .slice(0, 6)
            .map((x) => `${x.real}→${x.fake}`)
            .join(", ")}`
        : "";
      const body = (r.errorText || r.text).slice(0, 200).replace(/\n/g, " ");
      return `${state} ${r.id} (${Math.round(r.ms / 1000)}s)${tools}\n    ${body}${redact}`;
    })
    .join("\n");
}

/**
 * Les actions VERS L'EXTÉRIEUR (envoyer, créer, publier) confirmées au plus une
 * fois par conversation — l'assertion anti-double-envoi.
 *
 * ⚠️ Volontairement restreinte à ces outils-là : le gate d'écriture est fail-closed
 * (« inconnu ⇒ écriture »), donc un outil de LECTURE non classé — `posthog__exec`,
 * mesuré 7× — demande confirmation lui aussi. Compter toute confirmation répétée
 * comme un double-envoi confondrait « le modèle boucle » (qualité, mesurée par
 * `maxRepeat`) avec « l'utilisateur a envoyé deux fois » (sécurité). Deux symptômes,
 * deux verdicts.
 */
export const OUTWARD_TOOLS = /^(slack|gmail|linear|google-calendar|notion)__/;

export function expectNoDoubleOutwardAction(
  confirms: { tool: string; convId: string; approved: boolean }[],
  pattern: RegExp = OUTWARD_TOOLS,
): void {
  const seen = new Map<string, number>();
  for (const c of confirms.filter((c) => c.approved && pattern.test(c.tool)))
    seen.set(`${c.convId}·${c.tool}`, (seen.get(`${c.convId}·${c.tool}`) ?? 0) + 1);
  const doubled = [...seen].filter(([, n]) => n > 1).map(([k, n]) => `${k}×${n}`);
  expect(doubled, `action sortante exécutée plusieurs fois : ${doubled.join(", ")}`).toEqual([]);
}

/** Le RÉSUMÉ de fiabilité du lot — ce qu'on regarde baisser en itérant sur la
 *  guidance : tours coupés par le plafond, et pire répétition d'un même outil. */
export function labReliability(results: LabResult[]): {
  looped: string[];
  worstRepeat: { id: string; n: number } | null;
} {
  const looped = results.filter((r) => r.loopStopped).map((r) => r.id);
  const worst = [...results].sort((a, b) => b.maxRepeat - a.maxRepeat)[0];
  return { looped, worstRepeat: worst ? { id: worst.id, n: worst.maxRepeat } : null };
}

/** Un tour en ERREUR est un échec du lot — sinon un 401 passe pour un succès
 *  (mesuré : trois tours « erreur » en 4 s laissaient le test vert). */
export function expectNoErrors(results: LabResult[]): void {
  const bad = results.filter((r) => r.error);
  expect(
    bad.map((r) => r.id),
    `tours en échec : ${bad.map((r) => `${r.id} → ${r.errorText || "(sans message)"}`).join(" | ")}`,
  ).toEqual([]);
}

/** Aucun tour ne doit rester bloqué : c'est l'incident `errorbrowser.md` (routeur
 *  vide → boucle qui n'aboutit pas), et le premier symptôme d'une guidance ratée. */
export function expectAllCompleted(results: LabResult[]): void {
  const stuck = results.filter((r) => r.timedOut).map((r) => r.id);
  expect(stuck, `tours jamais terminés : ${stuck.join(", ")}`).toEqual([]);
}
