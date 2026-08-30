import { UpdatesSection } from "./UpdatesSection";
import { EnvCard } from "./parts/EnvCard";
import { CustomStackCard } from "./parts/CustomStackCard";

// Versions tab — the installed build + auto-update toggle + the version HISTORY
// (infinite-scroll, notes expanded) with inline Contentful release notes (from
// analytics-fn), plus the runtime ENVIRONMENT card (production⇄staging switch for
// authorized accounts) and — only in a build that allows it — the SELF-HOSTED STACK
// card. Desktop only; all three are no-ops when their host slot is absent (e.g. the
// browser preview).
export function VersionsTab() {
  return (
    <div className="ver">
      <UpdatesSection />
      <EnvCard />
      <CustomStackCard />
    </div>
  );
}
