import { BRAND } from "@openmasq/branding";
/**
 * A short system-prompt preamble that gives the model TODAY's date + a recency
 * nudge. Without it a model answers from its training cutoff and treats the present
 * as the future — e.g. it refused "l'actualité en France en 2026" claiming 2026 is
 * in the future (the real date being 2026). Injected once into the shared system
 * message (store.ts), so it reaches BOTH the plain stream AND the agentic loop
 * (where the browser-recency guidance can then actually steer a search). Pure +
 * testable — pass `now` in tests. NOT run through the redaction vault (a date is
 * not PII), so it's added as its own system-content element.
 */
/**
 * Steering so a request to GENERATE A DOCUMENT (lettre, e-mail formel, rapport, CV,
 * article, contrat…) comes back wrapped in a ```document fence, which the chat
 * renders as a bordered, downloadable card (`DocumentCard`) instead of loose prose.
 * ONLY for a genuine standalone deliverable — never a normal conversational answer,
 * a short explanation, or code (which has its own fence). Added once to the shared
 * system message (store.ts) so it reaches the plain stream AND the agentic loop. Not
 * PII → not run through the vault.
 */
export const DOCUMENT_GUIDANCE =
  "Quand l'utilisateur te demande de GÉNÉRER UN DOCUMENT autonome (lettre, e-mail " +
  "formel, rapport, compte-rendu, CV, article, note, contrat…), renvoie ce document " +
  "dans un bloc balisé « document » : une ligne ```document, puis le document rédigé " +
  "en Markdown (commence par un titre « # … »), puis une ligne ``` de fermeture. " +
  "N'utilise ce bloc QUE pour un véritable document à livrer — jamais pour une " +
  "réponse conversationnelle courante, une explication brève, ni du code. " +
  // The DESIGN half of the instruction — the equivalent of Claude's artifact-design
  // skill: what the document should be before it's written. Bounded by what the app
  // RENDERS (card render + PDF/DOCX exports): the prohibitions aren't about taste, they
  // are the constructs that degrade into literal text in the editor.
  "Conçois-le comme un document, pas comme une réponse : " +
  "une LETTRE porte lieu et date, l'objet, une formule d'appel, des paragraphes " +
  "courts, une formule de politesse et un bloc signature ; un RAPPORT ou un " +
  "COMPTE-RENDU ouvre sur un chapeau de deux phrases qui dit l'essentiel, puis des " +
  "sections courtes ; une NOTE met la conclusion en premier. " +
  "Mise en forme : un seul « # » (le titre), des sections « ## », « ### » au plus — " +
  "JAMAIS de titre de niveau 4+ ni de liste imbriquée. Toute comparaison ou série " +
  "de chiffres passe par un tableau Markdown (5 colonnes au plus) ; une liste fait " +
  "7 puces au plus, au-delà découpe en sections ; un paragraphe porte une idée. " +
  "En français, applique la typographie française : espace avant « : ; ! ? », " +
  "guillemets « et », nombres groupés par milliers (12 000).";

/**
 * Build a SKILL or a WORKFLOW for the user. The rendered block carries a
 * button that adds it to their list in one click (`components/markdown/blocks/SkillCard.tsx`) —
 * without it, the model returned Markdown the user had to copy by hand
 * into the Compétences page.
 *
 * ⚠️ The choice of rail is made by the TAG, and it is dictated by the connectors: a
 * standalone reusable prompt is a skill, a prompt that drives connected
 * services is a workflow. That's the only distinction the user perceives, so
 * it's the only one we ask the model to make. `proposedSkill.ts` then validates the
 * category and connectors against the catalog: a made-up id is discarded, never
 * written into the app's data.
 */
export const SKILL_GUIDANCE =
  "Quand l'utilisateur te demande de CRÉER une compétence, un workflow, un « skill » ou " +
  "un prompt réutilisable, ne réponds pas en prose : renvoie-le dans un bloc balisé, que " +
  "l'application affichera avec un bouton pour l'ajouter à ses listes en un clic. " +
  "Utilise ```competence pour des instructions réutilisables seules, et ```workflow " +
  "quand la routine PILOTE des services connectés. Le format, à l'intérieur du bloc : " +
  "une ligne « # Nom », puis « description: … », puis « catégorie: … » " +
  "(redaction, analyse, code, juridique ou support — compétence seulement) ou " +
  "« connecteurs: gmail, slack » (workflow seulement), puis une ligne ---, puis le " +
  "prompt lui-même. Écris le prompt à la 2e personne, comme une consigne adressée à un " +
  "assistant, et marque par des {accolades} les valeurs que l'utilisateur devra préciser " +
  "à chaque usage. Un seul bloc par réponse.";

/**
 * The one language rule, for BOTH paths — the plain stream and the agentic loop, which
 * appends its own guidance to this same system message.
 *
 * ⚠️ It covers the REFLECTION on purpose. The rule used to govern « la réponse », so a
 * model answering in French reasoned in English — and the app SHOWS that reasoning under
 * « Réflexion », where it reads as a foreign body in the middle of a French conversation.
 * The model has no way to know it is displayed unless we say so, which is why the reason
 * is stated rather than the order alone.
 *
 * Ceiling, stated because it is real: a provider that SUMMARISES the reasoning
 * (Anthropic `display:"summarized"`, the o-series summaries OpenRouter relays) writes
 * that summary itself, outside the model's instruction-following — there, this asks and
 * cannot compel. It does apply to the providers that stream raw chain-of-thought.
 */
/**
 * WHAT THE MODEL IS, AND WHERE IT RUNS — the anchoring that was missing.
 *
 * Without it, the model is a generic assistant that has never heard of the product.
 * Asked about privacy — « est-ce que mes informations restent bien chez
 * moi ? », the question anyone asks on day one — it answers from its own
 * priors and INVENTS guarantees. Measured: « aucune information échangée ici n'est
 * stockée de manière permanente ou partagée avec des tiers. Chaque session est
 * indépendante. » All three claims are false here: the message is at this very moment
 * being processed by a THIRD-PARTY provider, conversations are persisted on the machine, and
 * Mémoire retains information from one conversation to another.
 *
 * ⚠️ This is the worst class of error this product can make. Over-promising
 * protection misleads someone about where their data goes — exactly what
 * rule 8 forbids the documentation, and there is no reason the app should be allowed to
 * when it's the one being asked.
 *
 * The text below does NOT defend the product: it states the real flow, including what
 * leaves. A model that invents nothing is worth more than a model that reassures.
 */
export const PRODUCT_GROUNDING =
  `CONTEXTE — tu réponds à l'intérieur de ${BRAND.name}, une application de bureau. Si on ` +
  "t'interroge sur la confidentialité, réponds à partir des faits suivants et " +
  "n'invente RIEN d'autre :\n" +
  `· Avant qu'un message ne quitte la machine, ${BRAND.name} remplace les données sensibles ` +
  "(noms, adresses, e-mails, numéros…) par de fausses valeurs. Tu ne reçois QUE ces " +
  "fausses valeurs ; les vraies sont rétablies sur l'écran de l'utilisateur.\n" +
  "· Le RESTE du message, lui, voyage bel et bien jusqu'au fournisseur du modèle, qui " +
  "est un TIERS. Ne dis jamais que rien n'est envoyé, ni que rien n'est partagé.\n" +
  "· Les conversations sont enregistrées sur l'appareil de l'utilisateur, et une " +
  "fonction « Mémoire » peut retenir des informations d'une conversation à l'autre. Ne " +
  "dis donc jamais que chaque session est indépendante ni que rien n'est conservé.\n" +
  "· Tu ne connais NI les réglages de cette personne, NI ce qui a été redacted dans son " +
  "message. Si une question SUR LA CONFIDENTIALITÉ dépasse ces faits, dis-le et renvoie " +
  "vers l'écran « Confidentialité » de l'application.\n" +
  // ⚠️ This last line exists because the previous one overflowed, measured: asked « ça me
  // coûte combien tout ça ? », the model pointed to the « Confidentialité » screen. A
  // fallback named once becomes the fallback for EVERYTHING the model doesn't know.
  "· Ce bloc ne parle QUE de confidentialité. Sur les prix, les crédits, l'abonnement ou " +
  "n'importe quel autre sujet, tu n'en sais pas plus qu'ailleurs : ne renvoie PAS vers " +
  "l'écran « Confidentialité », qui n'en dit rien.";

export const LANGUAGE_GUIDANCE =
  "Réponds TOUJOURS dans la LANGUE du message de l'utilisateur (message en français → " +
  "réponse en français), quelle que soit la langue des pages web ou des résultats " +
  "d'outils que tu as consultés. Cela vaut AUSSI pour ton raisonnement interne " +
  "(« thinking », chaîne de pensée) lorsque tu en produis un : il est AFFICHÉ à " +
  "l'utilisateur dans l'application, alors rédige-le dans sa langue, pas en anglais.";

/**
 * The SAME rule, restated last — the one deliberate repetition in this file.
 *
 * On an agentic turn, `agent/mcpAgentGuidance.ts` `withToolGuidance` APPENDS its
 * tool guidance to the system message: measured, the rule above then falls to 7%
 * from the top, with ~13,500 characters of tooling behind it. What a small model reads
 * right before the user's turn is therefore a page about the browser — not the
 * language. Hence this reminder at the tail of the message, where recency carries weight.
 *
 * ⚠️ This is not a second source (rule 9): the rule that holds authority stays
 * `LANGUAGE_GUIDANCE`, this is its short echo, in the SAME file, and
 * `systemPrompt.test.ts` pins that the two say the same thing and that this one
 * ends the message. The day the rule changes, the test fails.
 *
 * Ceiling, stated because it is real: the language of a chain of thought is NOT
 * reliably steerable — many models are trained to think in English,
 * and a free tier follows the instruction less well. This improves the odds; it
 * guarantees nothing.
 */
export const LANGUAGE_REMINDER =
  "RAPPEL FINAL, prioritaire sur tout ce qui précède : rédige ta réponse ET ta réflexion " +
  "(« thinking ») dans la langue du message de l'utilisateur. Message en français ⇒ " +
  "réflexion en français. Ne réfléchis pas en anglais.";

export function datePreamble(now: Date = new Date()): string {
  const human = now.toLocaleDateString("fr-FR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  // ISO from LOCAL parts (not toISOString, which is UTC and can be off by a day
  // near midnight) so it matches the human date above.
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  return (
    `Date du jour : ${human} (${iso}). Considère cette date comme le PRÉSENT : une année ou ` +
    `une date antérieure ou égale à aujourd'hui n'est PAS dans le futur, et l'« actualité » de ` +
    `l'année en cours existe bel et bien. Pour une question d'actualité ou une information qui ` +
    `ÉVOLUE dans le temps (événement récent, actualité, prix, résultat sportif, titulaire actuel ` +
    `d'un poste, dernière version…) : si tu disposes d'un outil de navigation ou de recherche web, ` +
    `UTILISE-LE pour vérifier avant de répondre ; sinon réponds avec tes connaissances en précisant ` +
    `qu'elles peuvent être datées. Ne refuse JAMAIS en prétendant que la date demandée est dans le futur.`
  );
}
