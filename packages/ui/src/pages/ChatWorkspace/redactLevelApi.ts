import { categoriesForLevel, levelBars, levelOf, type PrivacyLevel } from "../../privacy/privacyLevel";
import type { RedactLevelApi } from "./ComposerRedactMenu";
import type { Conversation, Settings } from "../../types";

/**
 * Ce que le bouton « niveau » du composeur peut lire et écrire — PUR, donc testable sans
 * monter un écran, et hors de `ChatView` (déjà en dette de taille).
 *
 * ⚠️ Les DEUX écritures sont celles de la modale des règles, pas des nouvelles : la portée
 * « cette conversation » écrit la surcharge du fil, « toujours » écrit les réglages. Un
 * second chemin d'application aurait fini par diverger de celui du menu ⋯ et de Réglages →
 * Confidentialité — « appliquer un niveau » ne veut rien dire de plus ici (règle 9).
 *
 * Le niveau MONTRÉ est l'effectif de la conversation ouverte (global ⊕ surcharge), avec les
 * catégories imposées par l'organisation EXCLUES de la comparaison : elles sont actives quoi
 * qu'il arrive, et les compter afficherait « Sur mesure » à un membre qui n'a rien touché.
 */
export function buildRedactLevelApi(input: {
  settings?: Settings;
  onChangeSettings?: (s: Settings) => void;
  conversation?: Conversation | null;
  onChangeConversation?: (id: string, cats: Conversation["redactCategories"]) => void;
  forcedCategories?: string[];
}): RedactLevelApi | undefined {
  const { settings, onChangeSettings, conversation, onChangeConversation, forcedCategories } = input;
  if (!settings || !onChangeSettings) return undefined;
  const level = levelOf(
    { ...settings.redactCategories, ...(conversation?.redactCategories ?? {}) },
    forcedCategories,
  );
  return {
    level,
    // Le glyphe du bouton porte le niveau EN COURS — `levelBars` sait qu'un « Sur mesure »
    // ne revendique aucun palier et se déduit de ce qui est réellement actif.
    bars: levelBars(level, settings.redactCategories, forcedCategories),
    // Le clic pose le niveau sur LA CONVERSATION — le périmètre le moins surprenant depuis
    // une barre de saisie. Sans conversation (premier message) il n'y a rien à surcharger :
    // c'est alors le défaut qui reçoit, sinon le geste ne ferait rien du tout.
    onApplyConversation:
      conversation && onChangeConversation
        ? (l: Exclude<PrivacyLevel, "custom">) =>
            onChangeConversation(conversation.id, categoriesForLevel(l) as Conversation["redactCategories"])
        : undefined,
    onApplyAlways: (l: Exclude<PrivacyLevel, "custom">) =>
      onChangeSettings({ ...settings, redactCategories: categoriesForLevel(l) }),
  };
}
