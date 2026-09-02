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
    // Forcing it into "production" would send you looking for a bug in the wrong env.
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
    // The agent browser queries the web with the REAL value (rule 11): the
    // full URL of a navigation crash would therefore say exactly what the rule
    // protects everywhere else.
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
    // ── Everything below carries content and must NOT come back out ──
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
    // The proof that matters: the entire serialization no longer contains anything real.
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
    // The two fields through which a real value enters a crash report.
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
    // A version bump that added a field carrying content has nothing to
    // re-neutralize here: it's simply not copied over.
    const out = scrubEvent({ ...richEvent(), futur_champ_du_sdk: "donnée réelle" })!;
    expect(JSON.stringify(out)).not.toContain("donnée réelle");
  });
});

/**
 * THE VERSION, and the fact that both processes state the SAME one.
 *
 * Sentry attaches a report to a `release`. Main reads `app.getVersion()` — the version
 * STAMPED by electron-builder (`-c.extraMetadata.version`, so `0.4.1-beta.123`);
 * the renderer reads the `VITE_APP_VERSION` define, frozen at bundle time, that is,
 * BEFORE this stamping. Without the env variable in the build step, it fell back to the
 * repo's `package.json` (`0.4.1`): a single app was thus sending two releases, and
 * PostHog's `app_version` (same define) didn't move from one update to the next.
 *
 * The test reads the WORKFLOW because that's the only place the fault could live —
 * the code, on both sides, was correct. A comment wouldn't have failed in CI.
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
    // Two versions that look alike without being linked is the original bug in
    // another form: we require textual equality of the source, not a plausible value.
    //
    // ⚠️ Le timbrage passe par une VARIABLE SHELL (`-c.extraMetadata.version="$APP_VERSION"`),
    // pas par une expression `${{ }}` écrite en ligne — la commande est dans un `run:`
    // multi-ligne où l'expression aurait été interpolée dans le script. Le test suivait
    // l'ancienne forme et cherchait un `${{ }}` collé à `extraMetadata.version=` : il ne
    // trouvait plus rien et comparait à `undefined`. On suit donc l'indirection, parce que
    // c'est elle qui existe — l'invariant protégé est inchangé : UNE source pour les deux.
    const bundle = wf.match(/VITE_APP_VERSION:\s*(\$\{\{[^}]+\}\})/)?.[1];
    const shellVar = wf.match(/extraMetadata\.version="\$(\w+)"/)?.[1];
    expect(bundle).toBeTruthy();
    expect(shellVar).toBeTruthy();
    const stamped = wf.match(new RegExp(`\\n\\s+${shellVar}:\\s*(\\$\\{\\{[^}]+\\}\\})`))?.[1];
    expect(stamped).toBeTruthy();
    expect(bundle).toBe(stamped);
  });
});

/**
 * REGRESSION — Sentry had no operational-noise filter at all, while PostHog's
 * `$exception` channel had had one for weeks. Result measured on 12/08:
 * 1590 of the project's 1710 events (93%) were TWO MCP transport messages,
 * exactly the rate `packages/analytics` had already found on the other channel.
 * The predicate isn't copied here — it's `isOperationalError`, imported.
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
    // 66 reports of an updates-feed timeout, in French: the English patterns
    // didn't catch it, and "MCP error -32001: Request timed out" is its twin.
    expect(sentryBeforeSend(evt("Error", "running=0.6.0 ch=desktop-staging · La requête a expiré."))).toBeNull();
    expect(sentryBeforeSend(evt("McpError", "MCP error -32001: Request timed out"))).toBeNull();
  });

  it("GARDE un vrai bug — c'est le signal que le bruit cachait", () => {
    const out = sentryBeforeSend(evt("Error", "spawn npx ENOENT"));
    expect(out).not.toBeNull();
    expect((out as { exception: { values: { value: string }[] } }).exception.values[0].value).toBe(
      "spawn npx ENOENT",
    );
    // The bundle missing app-update.yml (the 0.6.0 regression) MUST pass through: it's a
    // packaging regression, exactly the class this filter swears to preserve.
    expect(
      sentryBeforeSend(evt("Error", "running=0.6.0 ch=desktop-staging · ENOENT: no such file or directory, open '/Applications/Acme.app/Contents/Resources/app-update.yml'")),
    ).not.toBeNull();
  });

  it("ne jette JAMAIS un plantage non rattrapé, même au texte « opérationnel »", () => {
    // Three ways an uncaught crash is recognized, all covered: our tag,
    // the SDK's level, and its mechanism. An uncaught "fetch failed" IS a crash.
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
    // A DIFFERENT signature starts fresh — the cap is per-failure, not global.
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
    // An id that doesn't have the shape of a bounded identifier doesn't pass.
    expect(scrubEvent({ ...base(), user: { id: "marie morvan <m@exemple.fr>" } })!).not.toHaveProperty("user");
  });

  it("mechanism.handled survit — c'est lui qui remplit les vues crash de Sentry", () => {
    const out = scrubEvent(base())! as Record<string, any>;
    expect(out.exception.values[0].mechanism).toEqual({ type: "onuncaughtexception", handled: false });
  });

  it("le fingerprint que NOUS posons ([scope, code]) sépare les issues synthétisées", () => {
    const out = scrubEvent({ ...base(), fingerprint: ["updates", "updater-404"] })! as Record<string, any>;
    expect(out.fingerprint).toEqual(["updates", "updater-404"]);
    // A non-string fingerprint is discarded, never copied over as is.
    expect(scrubEvent({ ...base(), fingerprint: [{ evil: 1 }] })!).not.toHaveProperty("fingerprint");
  });
});
