/**
 * THE FIRST LAUNCH — four screens, plus the « régler finement » fallback.
 *
 * ⚠️ It is the only surface an English speaker meets BEFORE being able to change language:
 * the picker lives in the Settings, behind this screen. A sentence left in French
 * here is not an imperfection, it is the product's first impression for someone
 * who cannot read it.
 *
 * ⚠️ Rule 8: the first screen's two BEHAVIOUR promises (famous people are never
 * masked; we offer to reveal before a web search) are true of the
 * engine and pinned by `demo.test.ts`. They exist to stop people lowering
 * the protection on the first miss — translating them carelessly takes back what they
 * prevent.
 *
 * A SLICE of the contract (`../messages.ts`), which stays the only list of namespaces.
 */
export interface OnboardingMessages {
  /** The footer controls, present on every screen. */
  skip: string;
  back: string;
  next: string;
  start: string;

  /** Screen 0 — what redaction DOES, demonstrated rather than asserted. */
  redaction: {
    eyebrow: string;
    titleLead: string;
    titleHighlight: string;
    sub: (brand: string) => string;
    /** The two behaviour promises — see the warning above. */
    notoriety: { lead: string; strong: string; tail: string };
    webReveal: { lead: (brand: string) => string; strong: string; tail: string };
  };

  /** Screen 1 — the places where one works. The names come from `sections`. */
  places: {
    eyebrow: string;
    title: string;
    sub: string;
  };

  /** Screen 2 — model access. The title CHANGES with what this build serves: a
   *  subscription (`titleServed`), included models with nothing for sale (`titleIncluded`,
   *  the default), or nothing at all (`titleUnserved`). */
  access: {
    eyebrow: string;
    titleServed: string;
    titleIncluded: string;
    titleUnserved: string;
    subServed: string;
    subUnserved: string;
  };

  /** Screen 3 — « c'est prêt ». The 2nd sentence makes the 1st verifiable: a free model is
   *  selected by default, so a fresh install writes with no key and no subscription. */
  ready: {
    eyebrow: string;
    title: string;
    subServed: (brand: string) => string;
    subUnserved: string;
    modelHint: string;
    slashHint: { lead: string; strong: string; tail: string };
    helpHint: { lead: string; strong: string; tail: string };
    tuneRedaction: string;
  };

  /** The « régler finement » fallback, which renders the same matrix as the Settings. */
  tune: {
    eyebrow: string;
    title: string;
    sub: string;
  };

  /** The ACCESS choice: the account (a subscription, or included models with nothing
   *  for sale — `included`, the default), or one's own key. */
  keyChoice: {
    subscription: { title: (brand: string) => string; sub: string };
    included: { sub: string };
    ownKey: { title: string; sub: string };
    /** The tag carried by the recommended option and the recommended provider. */
    recommended: string;
    savedKey: (provider: string) => string;
    connect: string;
    connecting: string;
    retry: string;
    connectTip: (brand: string) => string;
    connectHint: string;
    manualCreate: string;
    manualHave: string;
    errorIncomplete: string;
    errorUnreachable: string;
    errorSaveFailed: string;
  };

  /** The key form: the provider's steps, then the field. */
  keySteps: {
    markDone: string;
    openHost: (host: string) => string;
    placeholder: (provider: string, hint: string) => string;
    placeholderPlain: (provider: string) => string;
    save: string;
    saving: string;
  };
}
