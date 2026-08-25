// East-Asia real places — China (6-digit postal + 省/直辖市) and South Korea (5-digit
// postal + 도/광역시). city = the local-script name, postal = a plausible real code,
// region = the administrative province/municipality (the coherence anchor).
//
// ⚠️ SEED DATA, hand-written from major cities — the city↔province pairing is accurate
// (it drives the cross-field coherence); the postal codes are representative real prefixes
// (a redaction FAKE only needs a plausible same-shape code, not the city's exact one).
// NEEDS HUMAN VALIDATION before it's treated as exhaustive. A real CN/KR place NOT in this
// table falls back to shape-keep (no fake place), never a leak.
import type { GeoPlace, ISO2 } from "./types";

const CN: GeoPlace[] = [
  { city: "北京市", postal: "100000", region: "北京市" },
  { city: "上海市", postal: "200000", region: "上海市" },
  { city: "天津市", postal: "300000", region: "天津市" },
  { city: "重庆市", postal: "400000", region: "重庆市" },
  { city: "广州市", postal: "510000", region: "广东省" },
  { city: "深圳市", postal: "518000", region: "广东省" },
  { city: "成都市", postal: "610000", region: "四川省" },
  { city: "杭州市", postal: "310000", region: "浙江省" },
  { city: "武汉市", postal: "430000", region: "湖北省" },
  { city: "西安市", postal: "710000", region: "陕西省" },
  { city: "南京市", postal: "210000", region: "江苏省" },
  { city: "苏州市", postal: "215000", region: "江苏省" },
  { city: "无锡市", postal: "214000", region: "江苏省" },
  { city: "长沙市", postal: "410000", region: "湖南省" },
  { city: "青岛市", postal: "266000", region: "山东省" },
  { city: "济南市", postal: "250000", region: "山东省" },
  { city: "沈阳市", postal: "110000", region: "辽宁省" },
  { city: "大连市", postal: "116000", region: "辽宁省" },
  { city: "郑州市", postal: "450000", region: "河南省" },
  { city: "昆明市", postal: "650000", region: "云南省" },
  { city: "厦门市", postal: "361000", region: "福建省" },
  { city: "福州市", postal: "350000", region: "福建省" },
  { city: "哈尔滨市", postal: "150000", region: "黑龙江省" },
];

const KR: GeoPlace[] = [
  { city: "서울특별시", postal: "04524", region: "서울특별시" },
  { city: "부산광역시", postal: "48058", region: "부산광역시" },
  { city: "인천광역시", postal: "21999", region: "인천광역시" },
  { city: "대구광역시", postal: "41911", region: "대구광역시" },
  { city: "대전광역시", postal: "34126", region: "대전광역시" },
  { city: "광주광역시", postal: "61947", region: "광주광역시" },
  { city: "울산광역시", postal: "44677", region: "울산광역시" },
  { city: "세종특별자치시", postal: "30151", region: "세종특별자치시" },
  { city: "수원시", postal: "16490", region: "경기도" },
  { city: "성남시", postal: "13591", region: "경기도" },
  { city: "고양시", postal: "10380", region: "경기도" },
  { city: "용인시", postal: "16938", region: "경기도" },
  { city: "부천시", postal: "14547", region: "경기도" },
  { city: "안산시", postal: "15588", region: "경기도" },
  { city: "창원시", postal: "51139", region: "경상남도" },
  { city: "포항시", postal: "37666", region: "경상북도" },
  { city: "청주시", postal: "28501", region: "충청북도" },
  { city: "천안시", postal: "31118", region: "충청남도" },
  { city: "전주시", postal: "55040", region: "전라북도" },
  { city: "여수시", postal: "59631", region: "전라남도" },
  { city: "춘천시", postal: "24266", region: "강원도" },
  { city: "제주시", postal: "63166", region: "제주특별자치도" },
];

export const ASIA_PLACES: Record<ISO2, GeoPlace[]> = { CN, KR };
