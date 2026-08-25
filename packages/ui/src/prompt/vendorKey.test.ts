import { describe, expect, it } from "vitest";
import {
  NAME_VENDOR_NEEDLES,
  canonicalVendorKey,
  vendorFromName,
  vendorPrefix,
} from "./vendorKey";
import { glyphForModel } from "../components/media/ModelLogo/glyphKeys";

describe("vendorKey", () => {
  it("vendorPrefix extracts a namespaced prefix, else null", () => {
    expect(vendorPrefix("openai/gpt-4o")).toBe("openai");
    expect(vendorPrefix("gpt-5.5")).toBeNull();
  });

  it("canonicalVendorKey strips a `~` endpoint prefix and folds aliases", () => {
    expect(canonicalVendorKey("~anthropic")).toBe("anthropic");
    expect(canonicalVendorKey("mistralai")).toBe("mistral");
    expect(canonicalVendorKey("meta-llama")).toBe("meta");
    expect(canonicalVendorKey("openai")).toBe("openai");
  });

  it("vendorFromName reads the vendor from a platform model name", () => {
    expect(vendorFromName("moonshotai/kimi-k2")).toBe("moonshot");
    expect(vendorFromName("glm-5.2")).toBe("z-ai");
    expect(vendorFromName("gemma-4-26b")).toBe("google");
    expect(vendorFromName("some-house-model")).toBeNull();
  });

  // Rule 9: this family recogniser and the LOGO recogniser (`glyphForModel`) are two
  // tables that MUST agree on the same needle set — else a platform card gets a family
  // header but its card shows the redact pearl (no vendor logo). Pin the parity here.
  it("every family name-needle is also recognised by the logo table", () => {
    for (const needle of NAME_VENDOR_NEEDLES) {
      expect(glyphForModel(`x/${needle}`), needle).not.toBeNull();
    }
  });
});
