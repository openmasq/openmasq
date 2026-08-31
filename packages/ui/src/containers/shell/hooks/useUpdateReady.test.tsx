// @vitest-environment jsdom
import { act } from "react";
import { Provider } from "react-redux";
import { describe, expect, it, beforeEach } from "vitest";
import { store } from "../../../state/redux";
import { resetSettingsCache, setReleaseNotesCache } from "../../../state/settingsCache";
import { mount } from "../../../testKit";
import type { Host, UpdateStatus } from "../../../host";
import { useUpdateReady, type UpdateReadyApi } from "./useUpdateReady";

/**
 * THE ANNOUNCEMENT OF A DOWNLOADED UPDATE — what the system used to do, worse.
 *
 * Three things are worth pinning, because each one, if missed, shows up as an
 * app defect rather than as an incorrect line of code: it only opens on
 * `downloaded` (never on « disponible » — the version isn't there yet); it only
 * opens ONCE per version, the updater re-signalling on every check; and
 * closing it doesn't erase the update, or else the rail's button would have nothing to
 * reopen.
 */

const NOTE = {
  version: "0.5.1",
  releaseDate: "2026-08-12",
  title: "Une version de plus",
  body: "",
  highlights: ["feat: Quelque chose"],
};

/** A minimal desktop host + the means to PUSH a status, as the updater does. */
function fakeHost() {
  let cb: ((s: UpdateStatus) => void) | null = null;
  const installs: number[] = [];
  const host: Partial<Host> = {
    releaseNotesUrl: "https://exemple.test/release-notes",
    updates: {
      onStatus: (fn: (s: UpdateStatus) => void) => {
        cb = fn;
        return () => {
          cb = null;
        };
      },
      install: async () => {
        installs.push(1);
      },
    } as unknown as Host["updates"],
  };
  return { host, installs, push: (s: UpdateStatus) => cb?.(s) };
}

function Probe({ out }: { out: { api?: UpdateReadyApi } }) {
  out.api = useUpdateReady();
  return null;
}

const render = (host: Partial<Host>) => {
  const out: { api?: UpdateReadyApi } = {};
  return mount(<Probe out={out} />, {
    host,
    wrap: (children) => <Provider store={store}>{children}</Provider>,
  }).then((ui) => ({ ui, out }));
};

beforeEach(() => {
  store.dispatch(resetSettingsCache());
  store.dispatch(setReleaseNotesCache([NOTE]));
});

describe("useUpdateReady", () => {
  it("s'ouvre sur « téléchargée », avec la note publiée de CETTE version", async () => {
    const h = fakeHost();
    const { ui, out } = await render(h.host);

    await act(async () => h.push({ state: "downloaded", version: "0.5.1", sizeBytes: 42 }));
    expect(out.api!.open).toBe(true);
    expect(out.api!.version).toBe("0.5.1");
    expect(out.api!.note?.title).toBe("Une version de plus");

    await ui.unmount();
  });

  /** ⚠️ « Disponible » means « we saw it on the server », not « we have it ». Announcing
   *  it there would offer a restart that would install nothing. */
  it("ne s'ouvre PAS tant que la mise à jour n'est que disponible ou en cours", async () => {
    const h = fakeHost();
    const { ui, out } = await render(h.host);

    await act(async () => h.push({ state: "available", version: "0.5.1" }));
    await act(async () => h.push({ state: "downloading", version: "0.5.1", percent: 80 }));
    expect(out.api!.open).toBe(false);
    expect(out.api!.version).toBeNull();

    await ui.unmount();
  });

  it("une seule ouverture automatique par version — l'updater re-signale à chaque vérification", async () => {
    const h = fakeHost();
    const { ui, out } = await render(h.host);

    await act(async () => h.push({ state: "downloaded", version: "0.5.1" }));
    await act(async () => out.api!.setOpen(false));
    expect(out.api!.open).toBe(false);

    await act(async () => h.push({ state: "downloaded", version: "0.5.1" }));
    expect(out.api!.open).toBe(false); // doesn't reopen over what we're writing
    // …but the update isn't lost: that's what the rail's button reopens.
    expect(out.api!.version).toBe("0.5.1");

    await ui.unmount();
  });

  it("une version SUIVANTE s'annonce à son tour", async () => {
    const h = fakeHost();
    const { ui, out } = await render(h.host);

    await act(async () => h.push({ state: "downloaded", version: "0.5.1" }));
    await act(async () => out.api!.setOpen(false));
    await act(async () => h.push({ state: "downloaded", version: "0.5.2" }));
    expect(out.api!.open).toBe(true);
    expect(out.api!.version).toBe("0.5.2");

    await ui.unmount();
  });

  it("sans note publiée, elle s'annonce quand même — le geste compte plus que le texte", async () => {
    store.dispatch(setReleaseNotesCache([]));
    const h = fakeHost();
    const { ui, out } = await render(h.host);

    await act(async () => h.push({ state: "downloaded", version: "0.9.9" }));
    expect(out.api!.open).toBe(true);
    expect(out.api!.note).toBeUndefined();

    await ui.unmount();
  });

  it("« Redémarrer maintenant » est le seul geste délégué à main", async () => {
    const h = fakeHost();
    const { ui, out } = await render(h.host);

    await act(async () => h.push({ state: "downloaded", version: "0.5.1" }));
    await act(async () => out.api!.install());
    expect(h.installs).toHaveLength(1);

    await ui.unmount();
  });

  it("sans plateforme de mise à jour (aperçu, mobile), rien ne s'arme", async () => {
    const { ui, out } = await render({});
    expect(out.api!.open).toBe(false);
    expect(out.api!.version).toBeNull();
    await ui.unmount();
  });
});
