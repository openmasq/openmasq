import { setSection, track, useAppDispatch, useAppSelector, type Section } from "../../state/redux";
import { sectionOrFallback, useFeatureAccess } from "../../state/featureAccess";

/**
 * Section navigation as a hook — the single source for "which screen is active + go
 * there". Reads the section via a selector (so a consumer re-renders ONLY when the
 * section changes) and dispatches the switch itself (+ the `section_change` analytics
 * event, once). Replaces drilling `section` + an `onChats/onLibrary/onVault/onSettings`
 * callback set from AppShell into every nav chrome (Rail, BottomNav, …).
 *
 * ⚠️ **C'est aussi le seul endroit où une section FERMÉE est ramenée aux
 * conversations** (`state/featureAccess.ts`), et c'est possible parce que ce hook est
 * l'unique lecteur de `ui.section`. Trois cas y passent d'un coup, qu'un garde posé au
 * boot n'aurait pas couverts : une section persistée fermée depuis le dernier
 * lancement, un drapeau qui bascule PENDANT qu'on est sur l'écran, et tout `go()`
 * d'où qu'il vienne (rail, ⌘K, lien profond, amorce). On ne corrige pas redux pour
 * autant : la valeur persistée reste, donc rouvrir la porte ramène l'utilisateur là
 * où il était.
 */
export function useSectionNav(): { section: Section; go: (s: Section) => void } {
  const dispatch = useAppDispatch();
  const stored = useAppSelector((s) => s.ui.section);
  // Abonnement aux accès : sans lui, fermer une porte ne re-rendrait rien et
  // l'écran fermé resterait affiché jusqu'à la prochaine navigation.
  useFeatureAccess();
  const section = sectionOrFallback(stored);
  const go = (s: Section): void => {
    const target = sectionOrFallback(s);
    if (target !== section) dispatch(track({ name: "section_change", section: target }));
    dispatch(setSection(target));
  };
  return { section, go };
}
