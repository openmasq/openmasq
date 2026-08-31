/**
 * « Où trouver votre clé API », par FOURNISSEUR — le tutoriel détaillé d'`ApiKeyModal` et
 * de l'étape clé du premier lancement.
 *
 * ⚠️ Ce qui n'est PAS ici, et ne doit pas y entrer : l'ADRESSE de la page officielle, le
 * PRÉFIXE de la clé et son gabarit. Ce sont des faits sur le fournisseur, pas de la copie —
 * `ui/src/containers/modals/providerKeyHelp.ts` les garde, et c'est lui qui décide du
 * verdict au collage. Traduire un préfixe n'aurait aucun sens ; le déplacer ici en ferait
 * une chaîne qu'une relecture peut « corriger ».
 *
 * ⚠️ Règle 8 : la `note` de DeepSeek dit où les messages transitent. C'est une information
 * de juridiction, pas un argument commercial — elle se traduit comme telle.
 *
 * Une TRANCHE du contrat (`../messages.ts`), qui reste la seule liste des namespaces.
 */
export interface ProviderKeyCopy {
  /** Les étapes, dans l'ordre. */
  steps: readonly string[];
  /** Une ligne sur le coût, la facturation ou l'hébergement. */
  note: string;
}

export interface ProviderKeysMessages {
  openai: ProviderKeyCopy;
  anthropic: ProviderKeyCopy;
  google: ProviderKeyCopy;
  mistral: ProviderKeyCopy;
  deepseek: ProviderKeyCopy;
  openrouter: ProviderKeyCopy;
  /** Le verdict au COLLAGE — documentation, jamais un blocage : un préfixe renommé
   *  transformerait un refus en cul-de-sac, et une mauvaise clé échoue de toute façon
   *  bruyamment au premier envoi. */
  wrongPrefix: (provider: string, prefix: string) => string;
  tooShort: string;
}
