import { setSection, track, useAppDispatch, useAppSelector, type Section } from "../../state/redux";
import { sectionOrFallback, useFeatureAccess } from "../../state/billing/featureAccess";

/**
 * Section navigation as a hook — the single source for "which screen is active + go
 * there". Reads the section via a selector (so a consumer re-renders ONLY when the
 * section changes) and dispatches the switch itself (+ the `section_change` analytics
 * event, once). Replaces drilling `section` + an `onChats/onLibrary/onVault/onSettings`
 * callback set from AppShell into every nav chrome (Rail, BottomNav, …).
 *
 * ⚠️ **It's also the only place where a CLOSED section is brought back to
 * conversations** (`state/featureAccess.ts`), and that's possible because this hook is
 * the sole reader of `ui.section`. Three cases pass through it at once, which a guard
 * placed at boot wouldn't have covered: a persisted section closed since the last
 * launch, a flag that flips WHILE the user is on the screen, and any `go()`
 * whatever it comes from (rail, ⌘K, deep link, priming). We don't fix redux for
 * that though: the persisted value stays, so reopening the gate brings the user back
 * where they were.
 */
export function useSectionNav(): { section: Section; go: (s: Section) => void } {
  const dispatch = useAppDispatch();
  const stored = useAppSelector((s) => s.ui.section);
  // Subscription to access: without it, closing a gate wouldn't re-render anything and
  // the closed screen would stay shown until the next navigation.
  useFeatureAccess();
  const section = sectionOrFallback(stored);
  const go = (s: Section): void => {
    const target = sectionOrFallback(s);
    if (target !== section) dispatch(track({ name: "section_change", section: target }));
    dispatch(setSection(target));
  };
  return { section, go };
}
