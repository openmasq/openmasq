// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mount } from "../../../testKit";
import { ConnectorModalHost } from "./ConnectorModalHost";

/**
 * The host that renders a connector's modal, openable ELSEWHERE than in Réglages. Two
 * things hold it up, and either one alone breaks both:
 *
 * 1. It must open on the VERY FIRST render. `useMcpConnectors` used to apply the
 *    requested connector inside a `useEffect`, so `openId` was `null` for one frame — and
 *    the host, which unmounts once nothing is open, would have closed again before even
 *    opening.
 * 2. It must hand control back when closed, otherwise the shell keeps it mounted and the
 *    same connector never re-opens (the nonce would change nothing, the element is already there).
 */

// The PRESENCE of the `mcp` slot is exactly what's being tested: it's the desktop platform.
const host = {
  mcp: {
    list: async () => [],
    catalog: async () => [],
    onChanged: () => () => {},
    // Present on desktop: it's what makes "direct" connectors exist.
    connectDirect: async () => undefined,
  },
};

const open = (onClose: () => void) =>
  mount(<ConnectorModalHost connectorId="slack" nonce={1} onClose={onClose} />, {
    host: host as never,
  });

describe("ConnectorModalHost", () => {
  it("ouvre la modale du connecteur demandé, sans se refermer au montage", async () => {
    const onClose = vi.fn();
    const m = await open(onClose);
    expect(m.maybe(".modal-scrim")).not.toBeNull();
    expect(m.el.textContent).toContain("Slack");
    // The trap: an initially null `openId` would have triggered the close right here.
    expect(onClose).not.toHaveBeenCalled();
    await m.unmount();
  });

  it("rend la main à la coquille quand la pile est refermée", async () => {
    const onClose = vi.fn();
    const m = await open(onClose);
    await m.click(".modal-scrim");
    expect(onClose).toHaveBeenCalled();
    await m.unmount();
  });
});
