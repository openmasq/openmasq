import { getMessages } from "@openmasq/i18n";
import { afterEach, describe, it, expect } from "vitest";
import { configurePlatformAccess } from "../send/platformAccess";
import { humanizeSendError, cleanErrorText, sendErrorAction, sendErrorReason } from "./errors";

/* Les classes d'erreur et leurs gestes ne dépendent pas de la langue ; le catalogue
   français est le témoin, et les motifs attendus plus bas sont les siens. */
const t = getMessages("fr");

describe("humanizeSendError", () => {
  afterEach(() => configurePlatformAccess({ served: true }));

  it("maps the raw 402 CREDITS_EXHAUSTED tool-loop error to a readable FR message", () => {
    const raw =
      `Error invoking remote method 'chat:complete-tools': Error: scaleway tools request failed (402): {"error":"CREDITS_EXHAUSTED"}`;
    const msg = humanizeSendError(raw, t);
    expect(msg).toBeTruthy();
    expect(msg).toMatch(/Crédits épuisés/);
    expect(msg).not.toContain("{"); // no JSON, no IPC noise
  });

  it("maps MODEL_NOT_ALLOWED and UPSTREAM_ERROR / UPSTREAM_UNAVAILABLE", () => {
    expect(humanizeSendError('… {"error":"MODEL_NOT_ALLOWED"}', t)).toMatch(/pas disponible/);
    expect(humanizeSendError('… {"error":"UPSTREAM_ERROR"}', t)).toMatch(/joindre le fournisseur/);
    // The gateway's bounded upstream-throw code (never leaks the internal message).
    expect(humanizeSendError('Anthropic tools request failed (502): {"error":"UPSTREAM_UNAVAILABLE"}', t)).toMatch(
      /joindre le fournisseur/,
    );
  });

  it("maps the TTFT-watchdog MODEL_STALL to an actionable message (too many tools / slow model)", () => {
    const msg = humanizeSendError("MODEL_STALL", t);
    expect(msg).toMatch(/n'a pas répondu/);
    expect(msg).toMatch(/outils|connecteurs/);
    expect(msg).not.toContain("MODEL_STALL"); // the raw marker isn't shown
  });

  it("returns null for an unrecognised error", () => {
    expect(humanizeSendError("some random failure", t)).toBeNull();
  });
});

describe("cleanErrorText", () => {
  it("strips the IPC wrapper and collapses a trailing JSON error body to (CODE)", () => {
    const raw =
      `Error invoking remote method 'chat:complete-tools': Error: scaleway tools request failed (402): {"error":"SOME_CODE"}`;
    const out = cleanErrorText(raw);
    expect(out).not.toContain("invoking remote method");
    expect(out).not.toContain("{");
    expect(out).toContain("(SOME_CODE)");
  });

  it("never returns an empty string", () => {
    expect(cleanErrorText("")).toBe("Une erreur est survenue.");
  });
});

describe("humanizeSendError — un quota épuisé, dit en français", () => {
  /** Le message réellement remonté le 02/08/2026, corps du fournisseur inclus. */
  const raw =
    'openrouter tools request failed (429) — après 7 tentatives: ' +
    JSON.stringify({
      error: {
        message: "Rate limit exceeded: free-models-per-day.",
        code: 429,
        metadata: {
          headers: {
            "X-RateLimit-Limit": "50",
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(new Date().setHours(24 + 2, 0, 0, 0)),
          },
          limit_source: "openrouter_free_tier_daily",
        },
      },
    });

  it("dit la limite et QUAND ça repart — « Ça repart demain » rend le reste inutile à dire", () => {
    const msg = humanizeSendError(raw, t)!;
    expect(msg).toContain("50 requêtes gratuites");
    expect(msg).toContain("demain à 02:00");
    // Et surtout PAS le conseil faux d'un quota journalier.
    expect(msg).not.toMatch(/réduis|fréquence/i);
    // Ni le mur de JSON que l'utilisateur voyait.
    expect(msg).not.toContain("X-RateLimit");
  });

  it("une RAFALE garde le conseil qui marche pour elle : attendre", () => {
    const msg = humanizeSendError('mistral tools request failed (429): {"error":"Too many requests"}', t)!;
    expect(msg).toMatch(/attendez quelques secondes/i);
    expect(msg).not.toMatch(/quota/i);
  });

  // Règle de rédaction n° 1 (en tête d'`errors.ts`) : UN message = UN geste, les issues
  // sont des BOUTONS (CTA abonnement de la carte, sélecteur de modèle). L'ancienne
  // version énumérait « changez de modèle, ou passez par l'abonnement » en prose — le
  // tic le plus machinal du corpus, redondant avec les clics visibles juste dessous.
  it("reste court et n'énumère pas en prose ce que les boutons portent déjà", () => {
    const msg = humanizeSendError(raw, t)!;
    expect(msg.length).toBeLessThan(120);
    expect(msg).not.toMatch(/ou passez|ou changez/i);
  });
});

describe("sendErrorAction — le bouton sous un envoi échoué", () => {
  const daily =
    'openrouter tools request failed (429): {"error":{"message":"Rate limit exceeded: free-models-per-day","metadata":{"limit_source":"openrouter_free_tier_daily"}}}';

  it("propose l'abonnement quand le quota PÉRIODIQUE est épuisé — dans un build qui VEND", () => {
    configurePlatformAccess({ served: true, sold: true });
    expect(sendErrorAction(daily)).toEqual({ kind: "upgrade_plan" });
    configurePlatformAccess({ served: true });
  });

  it("ne propose RIEN par défaut : sans abonnement à prendre, un quota journalier s'attend", () => {
    expect(sendErrorAction(daily)).toBeUndefined();
  });

  // Une rafale se résout d'elle-même en quelques secondes : y coller « prenez un
  // abonnement » vendrait une solution à un problème déjà passé.
  it("ne propose RIEN pour une rafale de 429", () => {
    expect(sendErrorAction('mistral tools request failed (429): {"error":"Too many requests"}')).toBeUndefined();
  });

  it("ne propose rien pour une erreur qui n'est pas un 429", () => {
    expect(sendErrorAction("fetch failed")).toBeUndefined();
  });
});

describe("humanizeSendError — un compte fournisseur à sec (la clé de l'utilisateur)", () => {
  /** Le 429 réel d'OpenAI quand le compte n'a plus de crédits — aucun en-tête de
   *  quota, aucun mot journalier : la branche rafale répondait « patientez quelques
   *  secondes » à un refus que seul un paiement débloque. */
  const OPENAI = 'OpenAI API error 429: {"error":{"message":"You exceeded your current quota, ' +
    'please check your plan and billing details.","type":"insufficient_quota","code":"insufficient_quota"}}';
  /** Le 400 réel d'Anthropic — même panne, pas même costume : il tombait jusqu'au
   *  mur de JSON anglais. */
  const ANTHROPIC = 'Anthropic API error 400: {"type":"error","error":{"type":"invalid_request_error",' +
    '"message":"Your credit balance is too low to access the Anthropic API."}}';

  it("dit la vraie cause et le vrai remède — jamais « patientez »", () => {
    for (const raw of [OPENAI, ANTHROPIC]) {
      const msg = humanizeSendError(raw, t)!;
      expect(msg).toMatch(/n'a plus de crédits/);
      expect(msg).toMatch(/rechargez/i);
      expect(msg).not.toMatch(/patientez|attendez/i);
      expect(msg).not.toContain("{"); // plus de JSON anglais
    }
  });

  it("nomme l'acteur quand l'appelant le connaît — « votre compte OpenAI », pas une périphrase", () => {
    expect(humanizeSendError(OPENAI, t, { provider: "openai" })).toContain("Votre compte OpenAI");
    expect(humanizeSendError(ANTHROPIC, t, { provider: "anthropic" })).toContain("Votre compte Anthropic");
    // Sans fournisseur, le repli reste honnête et générique.
    expect(humanizeSendError(OPENAI, t)).toContain("chez le fournisseur");
  });

  it("offre la modale de clé quand l'appelant nomme le fournisseur", () => {
    expect(sendErrorAction(OPENAI, "openai")).toMatchObject({ kind: "missing_key", provider: "openai" });
    expect(sendErrorAction(ANTHROPIC, "anthropic")).toMatchObject({ kind: "missing_key", provider: "anthropic" });
    // Sans fournisseur, pas de CTA clé — un bouton qui n'ouvrirait rien.
    expect(sendErrorAction(OPENAI)).toBeUndefined();
  });

  it("compte en analytics comme un problème de crédits, ni rate_limit ni bad_request", () => {
    expect(sendErrorReason(new Error(OPENAI))).toBe("provider_credits");
    expect(sendErrorReason(new Error(ANTHROPIC))).toBe("provider_credits");
  });
});

describe("humanizeSendError — une clé refusée (présente mais fausse)", () => {
  const OPENAI_401 = 'OpenAI API error 401: {"error":{"message":"Incorrect API key provided: sk-…",' +
    '"type":"invalid_request_error","code":"invalid_api_key"}}';
  const ANTHROPIC_401 = 'Anthropic API error 401: {"type":"error","error":{"type":"authentication_error",' +
    '"message":"invalid x-api-key"}}';

  it("le dit en français, avec le geste qui répare", () => {
    for (const raw of [OPENAI_401, ANTHROPIC_401]) {
      const msg = humanizeSendError(raw, t)!;
      expect(msg).toMatch(/clé.*refusée/i);
      expect(msg).not.toContain("{");
    }
    expect(sendErrorAction(OPENAI_401, "openai")).toMatchObject({ kind: "missing_key", provider: "openai" });
  });
});

describe("humanizeSendError — les codes passerelle restants", () => {
  it("CREDITS_UNVERIFIABLE a sa phrase — un fail-closed voulu n'est pas un code cryptique", () => {
    const msg = humanizeSendError('scaleway tools request failed (402): {"error":"CREDITS_UNVERIFIABLE"}', t)!;
    expect(msg).toMatch(/vérifier vos crédits/i);
    expect(msg).toMatch(/rien n'est parti/i); // la promesse reste, dite une fois
    expect(msg).not.toContain("CREDITS_UNVERIFIABLE");
  });

  it("CREDITS_EXHAUSTED se décline selon le compte — perso n'a pas d'organisation", () => {
    const raw = 'scaleway tools request failed (402): {"error":"CREDITS_EXHAUSTED"}';
    // Par défaut rien ne se vend : le compte perso n'entend ni « organisation » ni « abonnement ».
    expect(humanizeSendError(raw, t, { personal: true })).not.toMatch(/organisation|abonnement|crédits/i);
    expect(humanizeSendError(raw, t, { personal: true })).toMatch(/votre propre clé/);
    configurePlatformAccess({ served: true, sold: true });
    expect(humanizeSendError(raw, t, { personal: true })).not.toMatch(/organisation/);
    expect(humanizeSendError(raw, t, { personal: true })).toMatch(/abonnement supérieur/);
    configurePlatformAccess({ served: true });
    expect(humanizeSendError(raw, t, { personal: false })).toMatch(/organisation/);
    // Défaut inchangé (compatibilité) : la formulation org.
    expect(humanizeSendError(raw, t)).toMatch(/organisation/);
  });

  it("la rafale de la passerelle cite SA fenêtre plutôt que « quelques secondes »", () => {
    const msg = humanizeSendError(
      'scaleway tools request failed (429): {"error":"RATE_LIMITED","retryAfterMs":60000}',
      t,
    )!;
    expect(msg).toContain("~1 min");
    expect(msg).not.toContain("quelques secondes");
  });
});

describe("humanizeSendError — « gratuit » n'est dit que quand le corps le dit", () => {
  it("un quota JOURNALIER sur clé payante n'est pas « gratuit »", () => {
    const msg = humanizeSendError(
      'google tools request failed (429): {"error":{"message":"Daily request quota exceeded for this project"}}',
      t,
    )!;
    expect(msg).toMatch(/^Votre quota chez le fournisseur est épuisé/);
    expect(msg).not.toMatch(/gratuit/i);
  });
});
