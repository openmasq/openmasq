/* eslint-disable react-refresh/only-export-components */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HostProvider, type Host } from "./host";
import type { ReactElement, ReactNode } from "react";

/**
 * The shared jsdom harness for component tests. **Test-only** — deliberately absent from
 * `src/index.ts`, so it is never part of the package's public API.
 *
 * It exists because the same ~15 lines of boilerplate had been written ELEVEN times, and
 * the copies had already forked: some reach `React.act` through a cast, some import `act`
 * from "react"; some await it, some don't; some set `IS_REACT_ACT_ENVIRONMENT`, some
 * inherit it from whichever test file ran first — which makes a suite's result depend on
 * file order. One harness, one set of answers.
 *
 * ⚠️ `mount` wraps the tree in a `HostProvider` by default. `useHost()` THROWS outside
 * one, so a leaf that reaches an optional slot (`MarkdownLink` → `host.links`) cannot be
 * rendered bare — and the fix must not be "give the test a fake host with methods",
 * which would quietly test a platform the product doesn't have. The default host is
 * EMPTY: every slot absent, which is a real platform (the browser preview) and the state
 * every component must degrade to. Pass `host` only to exercise a slot's PRESENCE.
 */

// React only treats `act()` as the real thing when this global is set, and it must be set
// before the first render of the process — hence module scope, not a `beforeAll`.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

export interface Mounted {
  /** The container element the tree rendered into. */
  el: HTMLElement;
  root: Root;
  /** Re-render with a new tree (same root) — for prop-change assertions. */
  rerender: (next: ReactElement) => Promise<void>;
  /** `el.querySelector`, typed and non-null-asserted: a missing node is a test bug,
   *  and `?.textContent` on it silently asserts nothing. */
  find: <E extends Element = HTMLElement>(selector: string) => E;
  /** `querySelector` that MAY legitimately miss — returns null. */
  maybe: <E extends Element = HTMLElement>(selector: string) => E | null;
  findAll: <E extends Element = HTMLElement>(selector: string) => E[];
  /** Click a node (or a selector) inside an `act`, so effects and state settle. */
  click: (target: Element | string) => Promise<void>;
  /** Type into an input/textarea the way React sees it (native setter + `input` event) —
   *  assigning `.value` alone does NOT notify React and the component never updates. */
  type: (target: HTMLInputElement | HTMLTextAreaElement | string, value: string) => Promise<void>;
  unmount: () => Promise<void>;
}

export async function mount(
  node: ReactElement,
  opts: { host?: Partial<Host>; wrap?: (children: ReactNode) => ReactElement } = {},
): Promise<Mounted> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  const wrap = (n: ReactElement) => (
    <HostProvider value={(opts.host ?? {}) as Host}>{opts.wrap ? opts.wrap(n) : n}</HostProvider>
  );

  await act(async () => {
    root.render(wrap(node));
  });

  const find = <E extends Element = HTMLElement>(selector: string): E => {
    const found = el.querySelector<E>(selector);
    if (!found) throw new Error(`testKit: no element matches ${JSON.stringify(selector)}`);
    return found;
  };
  const resolve = (target: Element | string) => (typeof target === "string" ? find(target) : target);

  return {
    el,
    root,
    find,
    maybe: <E extends Element = HTMLElement>(s: string) => el.querySelector<E>(s),
    findAll: <E extends Element = HTMLElement>(s: string) => [...el.querySelectorAll<E>(s)],
    rerender: async (next) => {
      await act(async () => {
        root.render(wrap(next));
      });
    },
    click: async (target) => {
      const node = resolve(target);
      await act(async () => {
        node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      });
    },
    type: async (target, value) => {
      const node = resolve(target) as HTMLInputElement | HTMLTextAreaElement;
      // React installs its own value setter on the element; going through the prototype's
      // is what makes React's onChange fire (the classic "controlled input won't update").
      const proto = Object.getPrototypeOf(node) as object;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      await act(async () => {
        setter ? setter.call(node, value) : (node.value = value);
        node.dispatchEvent(new Event("input", { bubbles: true }));
      });
    },
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      el.remove();
    },
  };
}

/** Dispatch a bare `mousedown` on `document.body` — the gesture every popover treats as
 *  "clicked outside". A plain `click` does NOT dismiss one (`usePopover` listens on
 *  mousedown on purpose), so a test that used `click` would assert the opposite of the
 *  contract and pass for the wrong reason. */
export async function clickOutside(): Promise<void> {
  await act(async () => {
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
}

/** Press a key on `document` — `Escape` is the other universal dismissal. */
export async function pressKey(key: string): Promise<void> {
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

/** Fire a bare window event (`scroll`, `resize`, `online`…) inside `act`. Dispatching it
 *  raw works but logs React's "not wrapped in act(...)" warning, which trains everyone
 *  to ignore that warning — and it is the one that catches real missing-act bugs. */
export async function fireWindow(type: string): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new Event(type));
  });
}

/** Leave the field — the gesture that COMMITS an `onBlur` (a settings textarea that only
 *  saves when leaving it, for instance).
 *
 *  ⚠️ React delegates `onBlur` to the native **`focusout`** event, which BUBBLES, and not
 *  to the native `blur`, which does not bubble and therefore never reaches the delegate. A
 *  test that dispatches `blur` triggers nothing, breaks nothing, and passes for the wrong
 *  reasons — it asserts the opposite of the contract it believes it is checking. */
export async function blur(node: Element): Promise<void> {
  await act(async () => {
    node.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}
