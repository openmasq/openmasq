import { describe, expect, it } from "vitest";
import { detectCjkGeo } from "./cjkGeo";

const tag = (t: string) => detectCjkGeo(t).map((d) => `${d.value}:${d.country}`);

describe("detectCjkGeo — CN/KR provinces (country anchor)", () => {
  it("detects Chinese provinces / municipalities / autonomous regions", () => {
    expect(tag("省：广东省")).toEqual(["广东省:CN"]);
    expect(tag("北京市 上海市")).toEqual(["北京市:CN", "上海市:CN"]);
    expect(tag("新疆维吾尔自治区")).toEqual(["新疆维吾尔自治区:CN"]);
  });
  it("detects Korean provinces / metro cities", () => {
    expect(tag("도 : 경기도")).toEqual(["경기도:KR"]);
    expect(tag("서울특별시, 제주특별자치도")).toEqual(["서울특별시:KR", "제주특별자치도:KR"]);
  });
  it("does NOT over-match prose ending in 省/도 (precision — known-list only)", () => {
    // 反省 (reflection), 정도 (degree) end in 省/도 but are NOT provinces.
    expect(detectCjkGeo("我需要反省一下。그 정도면 충분하다.")).toEqual([]);
  });
  it("carries country + REGION category + an offset", () => {
    const [d] = detectCjkGeo("广东省");
    expect(d.category).toBe("REGION");
    expect(d.country).toBe("CN");
    expect(typeof d.start).toBe("number");
  });
});
