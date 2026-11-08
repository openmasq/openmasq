import { describe, expect, it } from "vitest";
import { decodeHtmlEntities } from "./htmlEntities";

describe("decodeHtmlEntities", () => {
  it("decodes each entity ONCE: an escaped entity stays text", () => {
    expect(decodeHtmlEntities("&amp;lt;script&amp;gt;")).toBe("&lt;script&gt;");
    expect(decodeHtmlEntities("&amp;amp;")).toBe("&amp;");
  });
  it("decodes the named and numeric forms", () => {
    expect(decodeHtmlEntities("a &lt;b&gt; &quot;c&quot; &apos;d&#39; e&nbsp;f &#x41;&#66;")).toBe(`a <b> "c" 'd' e f AB`);
  });
  it("keeps a control or out-of-range code point as written", () => {
    expect(decodeHtmlEntities("&#1; &#x110000; &#0;")).toBe("&#1; &#x110000; &#0;");
  });
});
