import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveEnvironment, scrubEvent, scrubText, sentryBeforeSend } from "./policy";

describe("resolveEnvironment — l'environnement est TOUJOURS renseigné", () => {
  it("dérive du canal de mise à jour, la source unique du dépôt", () => {
    expect(resolveEnvironment("desktop-production")).toBe("production");
    expect(resolveEnvironment("desktop-staging")).toBe("staging");
  });

  it("une build locale est `development`, jamais vide ni « production » par défaut", () => {
    for (const v of [undefined, null, "", "   "]) expect(resolveEnvironment(v)).toBe("development");
  });

  it("un canal inconnu est reporté TEL QUEL", () => {
    // Le ranger d'office dans « production » ferait chercher un bug dans le mauvais env.
    expect(resolveEnvironment("desktop-canary")).toBe("desktop-canary");
  });
});

describe("scrubText — les formes de données personnelles les plus probables", () => {
  it("un chemin personnel perd le nom de l'utilisateur, garde la profondeur", () => {
    expect(scrubText("ENOENT: /Users/jean.rebour/Documents/bilan.pdf")).toBe(
      "ENOENT: ~/Documents/bilan.pdf",
    );
    expect(scrubText("C:\\Users\\Jean\\AppData\\openmasq.db")).toContain("~");
    expect(scrubText("C:\\Users\\Jean\\AppData\\openmasq.db")).not.toContain("Jean");
  });

  it("un courriel ne part pas", () => {
    expect(scrubText("échec pour marie.morvan@exemple.fr")).toBe("échec pour [courriel]");
  });

  it("une URL perd sa REQUÊTE — c'est là que voyage ce qu'on a cherché", () => {
    // Le navigateur agent interroge le web avec la VRAIE valeur (règle 11) : l'URL
    // complète d'un plantage de navigation dirait donc exactement ce que la règle
    // protège partout ailleurs.
    expect(scrubText("nav failed https://duckduckgo.com/?q=Marie+Morvan+salaire")).toBe(
      "nav failed https://duckduckgo.com/",
    );
    expect(scrubText("https://exemple.fr/page#section-secrete")).toBe("https://exemple.fr/page");
  });

  it("une longue suite de chiffres (IBAN, carte, téléphone, SIREN) est neutralisée", () => {
    expect(scrubText("IBAN FR7630006000011234567890189 refusé")).not.toMatch(/\d{6}/);
    expect(scrubText("tel 06 12 34 56 78")).toBe("tel [nombre]");
  });

  it("tronque — au-delà on recopie du contenu, on ne décrit plus une panne", () => {
    expect(scrubText("x".repeat(5000)).length).toBe(300);
  });

  it("ne casse pas sur autre chose qu'une chaîne", () => {
    for (const v of [undefined, null, 42, {}, []]) expect(scrubText(v)).toBe("");
  });
});

describe("scrubEvent — une liste d'AUTORISATION, pas d'exclusion (règle 7)", () => {
  const richEvent = () => ({
    event_id: "abc",
    timestamp: 1,
    level: "error",
    environment: "staging",
    release: "0.3.4",
    // ── Tout ce qui suit porte du contenu et ne doit PAS ressortir ──
    server_name: "MacBook-de-Marie",
    user: { email: "marie@exemple.fr", ip_address: "88.12.4.9" },
    request: { url: "https://exemple.fr/?q=secret", headers: { Cookie: "session=1" } },
    breadcrumbs: [{ category: "console", message: "IBAN FR76…" }],
    contexts: { device: { name: "MacBook de Marie" } },
    extra: { draft: "le texte du message de l'utilisateur" },
    modules: { react: "19" },
    tags: { process: "main", channel: "desktop-staging", rogue: "valeur inattendue" },
    exception: {
      values: [
        {
          type: "TypeError",
          value: "cannot read /Users/marie/notes.txt",
          stacktrace: {
            frames: [
              {
                filename: "/Users/marie/app/out/main/index.js",
                function: "sendMessage",
                lineno: 12,
                colno: 3,
                in_app: true,
                vars: { apiKey: "sk-reel", prompt: "vrai texte" },
                context_line: "const iban = 'FR7630006000011234567890189';",
                pre_context: ["// code source réel"],
              },
            ],
          },
        },
      ],
    },
  });

  it("ne recopie AUCUN des champs porteurs de contenu", () => {
    const out = scrubEvent(richEvent())!;
    for (const k of ["server_name", "user", "request", "breadcrumbs", "contexts", "extra", "modules"]) {
      expect(out, `\`${k}\` ne doit pas survivre`).not.toHaveProperty(k);
    }
    // La preuve qui compte : la sérialisation entière ne contient plus rien de réel.
    const wire = JSON.stringify(out);
    for (const leak of ["marie@exemple.fr", "88.12.4.9", "session=1", "MacBook", "sk-reel", "FR7630006000011234567890189", "le texte du message"]) {
      expect(wire, `« ${leak} » a fuité`).not.toContain(leak);
    }
  });

  it("garde ce qui SITUE la panne — type, ligne, fichier relatif", () => {
    const out = scrubEvent(richEvent())! as Record<string, any>;
    expect(out.exception.values[0].type).toBe("TypeError");
    const frame = out.exception.values[0].stacktrace.frames[0];
    expect(frame.lineno).toBe(12);
    expect(frame.function).toBe("sendMessage");
    expect(frame.filename).toBe("~/app/out/main/index.js");
    expect(out.environment).toBe("staging");
    expect(out.release).toBe("0.3.4");
  });

  it("les variables locales et le CODE SOURCE des frames ne sortent jamais", () => {
    // Les deux champs par lesquels une valeur réelle entre dans un rapport de plantage.
    const frame = (scrubEvent(richEvent())! as any).exception.values[0].stacktrace.frames[0];
    for (const k of ["vars", "context_line", "pre_context", "post_context"]) {
      expect(frame).not.toHaveProperty(k);
    }
  });

  it("n'accepte que NOS étiquettes", () => {
    const out = scrubEvent(richEvent())! as Record<string, any>;
    expect(out.tags).toEqual({ process: "main", channel: "desktop-staging" });
  });

  it("abandonne un événement sans exception ni message — rien ne part", () => {
    expect(scrubEvent({ event_id: "x", breadcrumbs: [{ message: "secret" }] })).toBeNull();
    expect(scrubEvent(null)).toBeNull();
    expect(scrubEvent(undefined)).toBeNull();
  });

  it("un CHAMP INCONNU du SDK ne passe pas — c'est tout l'intérêt de l'autorisation", () => {
    // Une montée de version qui ajouterait un champ porteur de contenu n'a rien à
    // re-neutraliser ici : il n'est simplement pas recopié.
    const out = scrubEvent({ ...richEvent(), futur_champ_du_sdk: "donnée réelle" })!;
    expect(JSON.stringify(out)).not.toContain("donnée réelle");
  });
});

/**
 * LA VERSION, et le fait que les deux processus disent la MÊME.
 *
 * Sentry rattache un rapport à une `release`. Le main lit `app.getVersion()` — la version
 * TIMBRÉE par electron-builder (`-c.extraMetadata.version`, donc `0.4.1-staging.123`) ;
 * le renderer lit le define `VITE_APP_VERSION`, figé au moment du bundle, c'est-à-dire
 * AVANT ce timbrage. Sans la variable d'env dans l'étape de build, il retombait sur le
 * `package.json` du dépôt (`0.4.1`) : une seule app envoyait donc deux releases, et
 * l'`app_version` de PostHog (même define) ne bougeait pas d'une mise à jour à l'autre.
 *
 * Le test lit le WORKFLOW parce que c'est le seul endroit où la faute pouvait vivre —
 * le code, lui, était correct des deux côtés. Un commentaire n'aurait pas échoué en CI.
 */
describe("release.yml — le renderer est bâti avec la version qui sera EXPÉDIÉE", () => {
  const wf = readFileSync(
    resolve(__dirname, "../../../../.github/workflows/release.yml"),
    "utf8",
  );

  it("l'étape de build du bundle desktop reçoit VITE_APP_VERSION", () => {
    const step = wf.slice(wf.indexOf("turbo run build --filter=@openmasq/desktop"));
    const env = step.slice(0, step.indexOf("\n      - "));
    expect(env).toContain("VITE_APP_VERSION:");
  });

  it("et c'est LA MÊME expression que celle timbrée par electron-builder", () => {
    // Deux versions qui se ressemblent sans être liées, c'est le bug d'origine sous une
    // autre forme : on exige l'égalité textuelle de la source, pas une valeur plausible.
    const bundle = wf.match(/VITE_APP_VERSION:\s*(\$\{\{[^}]+\}\})/)?.[1];
    const stamped = wf.match(/extraMetadata\.version=(\$\{\{[^}]+\}\})/)?.[1];
    expect(bundle).toBeTruthy();
    expect(bundle).toBe(stamped);
  });
});

/**
 * RÉGRESSION — Sentry n'avait aucun filtre de bruit d'exploitation, alors que le canal
 * `$exception` de PostHog en avait un depuis des semaines. Résultat mesuré le 12/08 :
 * 1590 des 1710 événements du projet (93 %) étaient DEUX messages de transport MCP,
 * exactement le taux que `packages/analytics` avait déjà constaté sur l'autre canal.
 * Le prédicat n'est pas recopié ici — c'est `isOperationalError`, importé.
 */
describe("sentryBeforeSend — le bruit d'exploitation n'est pas envoyé", () => {
  const evt = (type: string, value: string, extra: Record<string, unknown> = {}) => ({
    event_id: "e1",
    level: "error",
    exception: { values: [{ type, value, stacktrace: { frames: [] } }] },
    ...extra,
  });

  it("écarte les deux messages qui noyaient le tableau de bord", () => {
    expect(sentryBeforeSend(evt("Error", "Not connected"))).toBeNull();
    expect(sentryBeforeSend(evt("McpError", "MCP error -32000: Connection closed"))).toBeNull();
  });

  it("écarte le réseau transitoire et le refus d'auth, comme l'autre canal", () => {
    expect(sentryBeforeSend(evt("TypeError", "fetch failed"))).toBeNull();
    expect(sentryBeforeSend(evt("Error", "net::ERR_NETWORK_CHANGED"))).toBeNull();
    expect(sentryBeforeSend(evt("AuthRetryableFetchError", "boom"))).toBeNull();
  });

  it("écarte un timeout réseau, y compris LOCALISÉ — Electron parle la langue de l'OS", () => {
    // 66 rapports d'un timeout du feed de mise à jour, en français : les motifs anglais
    // ne le voyaient pas, et « MCP error -32001: Request timed out » est son jumeau.
    expect(sentryBeforeSend(evt("Error", "running=0.6.0 ch=desktop-staging · La requête a expiré."))).toBeNull();
    expect(sentryBeforeSend(evt("McpError", "MCP error -32001: Request timed out"))).toBeNull();
  });

  it("GARDE un vrai bug — c'est le signal que le bruit cachait", () => {
    const out = sentryBeforeSend(evt("Error", "spawn npx ENOENT"));
    expect(out).not.toBeNull();
    expect((out as { exception: { values: { value: string }[] } }).exception.values[0].value).toBe(
      "spawn npx ENOENT",
    );
    // Le bundle amputé d'app-update.yml (la régression 0.6.0) DOIT passer : c'est une
    // régression d'empaquetage, exactement la classe que ce filtre jure de préserver.
    expect(
      sentryBeforeSend(evt("Error", "running=0.6.0 ch=desktop-staging · ENOENT: no such file or directory, open '/Applications/Acme.app/Contents/Resources/app-update.yml'")),
    ).not.toBeNull();
  });

  it("ne jette JAMAIS un plantage non rattrapé, même au texte « opérationnel »", () => {
    // Trois façons dont un non-rattrapé se reconnaît, toutes couvertes : notre étiquette,
    // le niveau du SDK, et son mécanisme. Un « fetch failed » non rattrapé EST un plantage.
    expect(sentryBeforeSend(evt("Error", "Not connected", { tags: { scope: "uncaught" } }))).not.toBeNull();
    expect(sentryBeforeSend(evt("Error", "fetch failed", { level: "fatal" }))).not.toBeNull();
    expect(
      sentryBeforeSend({
        event_id: "e2",
        level: "error",
        exception: { values: [{ type: "Error", value: "Not connected", mechanism: { handled: false } }] },
      }),
    ).not.toBeNull();
  });

  it("passe la main au redaction : ce qui survit est toujours reconstruit", () => {
    const out = sentryBeforeSend(evt("Error", "ENOENT: /Users/jean.rebour/bilan.pdf"));
    expect((out as { exception: { values: { value: string }[] } }).exception.values[0].value).toBe(
      "ENOENT: ~/bilan.pdf",
    );
  });

  it("cap anti-inondation : la même signature ne part que 5 fois par session", () => {
    let sent = 0;
    for (let i = 0; i < 12; i++) {
      if (sentryBeforeSend(evt("Error", "spawn cap-test-unique ENOENT")) !== null) sent += 1;
    }
    expect(sent).toBe(5);
    // Une signature DIFFÉRENTE repart de zéro — le cap est par panne, pas global.
    expect(sentryBeforeSend(evt("Error", "spawn autre-panne-unique ENOENT"))).not.toBeNull();
  });
});

describe("scrubEvent — les ajouts diagnostics restent champ par champ (audit 13/08)", () => {
  const base = () => ({
    event_id: "e9",
    level: "error",
    exception: { values: [{ type: "Error", value: "boom", stacktrace: { frames: [] }, mechanism: { type: "onuncaughtexception", handled: false } }] },
  });

  it("os.name/os.version + device.arch passent — device.name/model JAMAIS", () => {
    const out = scrubEvent({
      ...base(),
      contexts: {
        os: { name: "macOS", version: "14.5", build: "23F79" },
        device: { arch: "x64", name: "MacBook de Marie", model: "MacBookPro18,3" },
      },
    })! as Record<string, any>;
    expect(out.contexts.os).toEqual({ name: "macOS", version: "14.5" });
    expect(out.contexts.device).toEqual({ arch: "x64" });
    expect(JSON.stringify(out)).not.toContain("Marie");
    expect(JSON.stringify(out)).not.toContain("MacBookPro18,3");
  });

  it("user.id (UUID anonyme) passe SEUL — email/IP jamais", () => {
    const out = scrubEvent({
      ...base(),
      user: { id: "3f2c1d8e-aaaa-bbbb-cccc-1234567890ab", email: "m@exemple.fr", ip_address: "1.2.3.4" },
    })! as Record<string, any>;
    expect(out.user).toEqual({ id: "3f2c1d8e-aaaa-bbbb-cccc-1234567890ab" });
    expect(JSON.stringify(out)).not.toContain("exemple.fr");
    // Un id qui n'a pas la forme d'un identifiant borné ne passe pas.
    expect(scrubEvent({ ...base(), user: { id: "marie morvan <m@exemple.fr>" } })!).not.toHaveProperty("user");
  });

  it("mechanism.handled survit — c'est lui qui remplit les vues crash de Sentry", () => {
    const out = scrubEvent(base())! as Record<string, any>;
    expect(out.exception.values[0].mechanism).toEqual({ type: "onuncaughtexception", handled: false });
  });

  it("le fingerprint que NOUS posons ([scope, code]) sépare les issues synthétisées", () => {
    const out = scrubEvent({ ...base(), fingerprint: ["updates", "updater-404"] })! as Record<string, any>;
    expect(out.fingerprint).toEqual(["updates", "updater-404"]);
    // Un fingerprint non-chaîne est écarté, jamais recopié tel quel.
    expect(scrubEvent({ ...base(), fingerprint: [{ evil: 1 }] })!).not.toHaveProperty("fingerprint");
  });
});
