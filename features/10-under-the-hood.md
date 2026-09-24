## 10. What protects, under the hood

### The guarantees you do not click
**Access**: nothing to click — it is what holds while you click elsewhere.

**What it makes possible.** That the promises of the previous sections stay true even when
something goes wrong: a hostile web page, a compromised connector, a model inventing a tool
call, a flaw in the interface.

**What it gives you.** Nothing visible — and that is the point. The difference shows on the
day it counts.

**What it is worth.** Four principles carry the essentials. **What comes in is data, never an
order**: a page or an e-mail arrives labelled, and anything that looks like an instruction
addressed to the model is flagged rather than obeyed — flagged, not deleted, because a filter
that amputates a legitimate reply ends up disabled. **Everything is replayed on the
privileged side**: every barrier in the interface is a convenience, the real decision is
retaken where the interface cannot lie. **We permit, we do not forbid**: the lists are
allow-lists, so a novelty on a vendor's side is refused by default instead of being opened
silently. **We fail closed**: on an error, a timeout or an unknown, the default outcome is the
protective one — the send is blocked, the result masked, the tool refused.

- [x] Provider keys encrypted, **never** read back by the interface
- [x] Local database encrypted, per account (two accounts on one machine do not see each other)
- [x] Five processes outside the privileged one (browser, Python jail, files, NER, embeddings)
- [x] Bundled models and binaries, pinned by hash, never downloaded on the fly
- [x] An anti-SSRF guard on every outgoing request, **and logged** (Réglages → Journal)
- [x] Fetched content (web page, e-mail, document) arrives **labelled as data**, and content
      that tries to give the model instructions is flagged as such —
      `packages/ui/src/send/inboundScreen.ts`
- [x] Every barrier in the interface is **replayed** on the privileged side
- [x] No secret and no real PII in the logs
- [x] **Organization MCP policy enforced on the privileged side**: a non-permitted connector
      is refused at call time, at connection time, and even if it is re-added by hand through
      its address — `apps/desktop/src/main/mcp/orgPolicy.ts`
- [x] An **absent** policy (not received yet) and an **empty** policy (nothing opened) are not
      conflated: the first lets through, the second closes
- [x] The **confirmation level mandated by the organization** is a floor: a member can
      strengthen it, never loosen it — `packages/catalog/src/mcp/confirmationPolicy.ts`
