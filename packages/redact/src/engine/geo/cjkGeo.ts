// CJK province/region detector — the country ANCHOR for East-Asia address blocks.
//
// A Chinese province ("广东省") or a Korean province / metro city ("경기도"/"서울특별시") is
// matched against the KNOWN admin-unit lists (a bare "…省"/"…도" suffix would over-match
// prose — "反省"/"정도"), so precision holds. Emitted as {value, category:"REGION",
// country:"CN"|"KR", start} — the country lets `geoBlocks` anchor the block to a covered
// place table and fake the city / postal / province from ONE coherent real CN/KR place.
// The block's City field (城市:/도시:) and Postal (邮编:/우편번호:) come from
// `detectLabeledFields`; the province here identifies the country.
import type { Detection } from "../../types";

// 34 CN province-level units (provinces / municipalities / autonomous regions / SARs).
const CN_PROVINCES = [
  "北京市", "上海市", "天津市", "重庆市", "河北省", "山西省", "辽宁省", "吉林省",
  "黑龙江省", "江苏省", "浙江省", "安徽省", "福建省", "江西省", "山东省", "河南省",
  "湖北省", "湖南省", "广东省", "海南省", "四川省", "贵州省", "云南省", "陕西省",
  "甘肃省", "青海省", "台湾省", "内蒙古自治区", "广西壮族自治区", "西藏自治区",
  "宁夏回族自治区", "新疆维吾尔自治区", "香港特别行政区", "澳门特别行政区",
];
// 17 KR province-level units (+ legacy 강원도 / 전라북도 spellings).
const KR_PROVINCES = [
  "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시",
  "울산광역시", "세종특별자치시", "경기도", "강원특별자치도", "강원도", "충청북도",
  "충청남도", "전북특별자치도", "전라북도", "전라남도", "경상북도", "경상남도",
  "제주특별자치도",
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Longest-first so "강원특별자치도" wins over "강원도"; "内蒙古自治区" over any prefix.
const alt = (a: string[]) => [...a].sort((x, y) => y.length - x.length).map(esc).join("|");
const CN_RE = new RegExp(alt(CN_PROVINCES), "gu");
const KR_RE = new RegExp(alt(KR_PROVINCES), "gu");

/** Detect CN/KR provinces (category REGION, country CN/KR). Verbatim → reversible. */
export function detectCjkGeo(text: string): Detection[] {
  if (!text) return [];
  const out: Detection[] = [];
  const seen = new Set<string>();
  const push = (value: string, country: string, start: number) => {
    if (seen.has(value)) return;
    seen.add(value);
    out.push({ value, category: "REGION", country, start });
  };
  for (const m of text.matchAll(CN_RE)) push(m[0], "CN", m.index);
  for (const m of text.matchAll(KR_RE)) push(m[0], "KR", m.index);
  return out;
}
