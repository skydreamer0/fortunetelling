/**
 * @fileoverview Offline city table (no geocoding service; D-029 local-first).
 *
 * Taiwan: all 22 counties/cities, coordinates of the county/city government
 * seat (縣市政府所在地), ~4 decimals. Overseas: common birthplaces of users.
 * Coordinates are city-centre approximations (WGS84, degrees; east/north positive)
 * — accurate to ~1 km, i.e. well under 1 min of local-mean-time error.
 * @module profile/cities
 */

import type { Birthplace } from './types';

export type City = {
  id: string;
  nameZh: string;
  nameEn: string;
  /** ISO 3166-1 alpha-2 country code. */
  country: string;
  lat: number;
  lng: number;
  /** IANA time zone. */
  timezone: string;
  /** Extra search terms (e.g. simplified/alternate spellings). */
  aliases?: readonly string[];
};

function city(
  id: string,
  nameZh: string,
  nameEn: string,
  country: string,
  lat: number,
  lng: number,
  timezone: string,
  aliases?: string[],
): City {
  const c: City = { id, nameZh, nameEn, country, lat, lng, timezone };
  if (aliases) c.aliases = Object.freeze(aliases);
  return Object.freeze(c);
}

const TW = 'Asia/Taipei';

/** 台灣 22 縣市（6 直轄市 + 3 市 + 13 縣），座標為縣市政府所在地。 */
export const TAIWAN_CITIES: readonly City[] = Object.freeze([
  city('taipei', '臺北市', 'Taipei', 'TW', 25.0375, 121.5637, TW),
  city('new-taipei', '新北市', 'New Taipei', 'TW', 25.012, 121.4651, TW, ['板橋', 'Banqiao']),
  city('taoyuan', '桃園市', 'Taoyuan', 'TW', 24.9936, 121.301, TW),
  city('taichung', '臺中市', 'Taichung', 'TW', 24.1618, 120.6469, TW),
  city('tainan', '臺南市', 'Tainan', 'TW', 22.9922, 120.1848, TW),
  city('kaohsiung', '高雄市', 'Kaohsiung', 'TW', 22.6203, 120.312, TW),
  city('keelung', '基隆市', 'Keelung', 'TW', 25.1283, 121.7419, TW),
  city('hsinchu-city', '新竹市', 'Hsinchu City', 'TW', 24.8039, 120.9647, TW, ['Hsinchu']),
  city('chiayi-city', '嘉義市', 'Chiayi City', 'TW', 23.48, 120.4491, TW, ['Chiayi']),
  city('hsinchu-county', '新竹縣', 'Hsinchu County', 'TW', 24.827, 121.0129, TW, ['竹北', 'Zhubei']),
  city('miaoli', '苗栗縣', 'Miaoli', 'TW', 24.5602, 120.8214, TW),
  city('changhua', '彰化縣', 'Changhua', 'TW', 24.0762, 120.5424, TW),
  city('nantou', '南投縣', 'Nantou', 'TW', 23.9157, 120.6639, TW),
  city('yunlin', '雲林縣', 'Yunlin', 'TW', 23.7092, 120.5434, TW, ['斗六', 'Douliu']),
  city('chiayi-county', '嘉義縣', 'Chiayi County', 'TW', 23.459, 120.332, TW, ['太保', 'Taibao']),
  city('pingtung', '屏東縣', 'Pingtung', 'TW', 22.6727, 120.488, TW),
  city('yilan', '宜蘭縣', 'Yilan', 'TW', 24.757, 121.7533, TW),
  city('hualien', '花蓮縣', 'Hualien', 'TW', 23.991, 121.6011, TW),
  city('taitung', '臺東縣', 'Taitung', 'TW', 22.7559, 121.1504, TW),
  city('penghu', '澎湖縣', 'Penghu', 'TW', 23.5655, 119.5863, TW, ['馬公', 'Magong']),
  city('kinmen', '金門縣', 'Kinmen', 'TW', 24.4368, 118.3186, TW, ['金城', 'Jincheng']),
  city('lienchiang', '連江縣', 'Lienchiang', 'TW', 26.158, 119.951, TW, ['馬祖', 'Matsu', '南竿', 'Nangan']),
]);

/** 常見海外出生地。 */
export const OVERSEAS_CITIES: readonly City[] = Object.freeze([
  city('hong-kong', '香港', 'Hong Kong', 'HK', 22.3193, 114.1694, 'Asia/Hong_Kong'),
  city('macau', '澳門', 'Macau', 'MO', 22.1987, 113.5439, 'Asia/Macau', ['澳门', 'Macao']),
  city('shanghai', '上海', 'Shanghai', 'CN', 31.2304, 121.4737, 'Asia/Shanghai'),
  city('beijing', '北京', 'Beijing', 'CN', 39.9042, 116.4074, 'Asia/Shanghai'),
  city('guangzhou', '廣州', 'Guangzhou', 'CN', 23.1291, 113.2644, 'Asia/Shanghai', ['广州']),
  city('shenzhen', '深圳', 'Shenzhen', 'CN', 22.5431, 114.0579, 'Asia/Shanghai'),
  city('xiamen', '廈門', 'Xiamen', 'CN', 24.4798, 118.0894, 'Asia/Shanghai', ['厦门']),
  city('singapore', '新加坡', 'Singapore', 'SG', 1.3521, 103.8198, 'Asia/Singapore'),
  city('kuala-lumpur', '吉隆坡', 'Kuala Lumpur', 'MY', 3.139, 101.6869, 'Asia/Kuala_Lumpur'),
  city('tokyo', '東京', 'Tokyo', 'JP', 35.6762, 139.6503, 'Asia/Tokyo', ['东京']),
  city('osaka', '大阪', 'Osaka', 'JP', 34.6937, 135.5023, 'Asia/Tokyo'),
  city('seoul', '首爾', 'Seoul', 'KR', 37.5665, 126.978, 'Asia/Seoul', ['首尔', '漢城']),
  city('bangkok', '曼谷', 'Bangkok', 'TH', 13.7563, 100.5018, 'Asia/Bangkok'),
  city('manila', '馬尼拉', 'Manila', 'PH', 14.5995, 120.9842, 'Asia/Manila', ['马尼拉']),
  city('jakarta', '雅加達', 'Jakarta', 'ID', -6.2088, 106.8456, 'Asia/Jakarta', ['雅加达']),
  city('ho-chi-minh-city', '胡志明市', 'Ho Chi Minh City', 'VN', 10.8231, 106.6297, 'Asia/Ho_Chi_Minh', ['Saigon', '西貢']),
  city('dubai', '杜拜', 'Dubai', 'AE', 25.2048, 55.2708, 'Asia/Dubai', ['迪拜']),
  city('sydney', '雪梨', 'Sydney', 'AU', -33.8688, 151.2093, 'Australia/Sydney', ['悉尼']),
  city('melbourne', '墨爾本', 'Melbourne', 'AU', -37.8136, 144.9631, 'Australia/Melbourne', ['墨尔本']),
  city('brisbane', '布里斯本', 'Brisbane', 'AU', -27.4698, 153.0251, 'Australia/Brisbane'),
  city('auckland', '奧克蘭', 'Auckland', 'NZ', -36.8485, 174.7633, 'Pacific/Auckland', ['奥克兰']),
  city('london', '倫敦', 'London', 'GB', 51.5074, -0.1278, 'Europe/London', ['伦敦']),
  city('paris', '巴黎', 'Paris', 'FR', 48.8566, 2.3522, 'Europe/Paris'),
  city('berlin', '柏林', 'Berlin', 'DE', 52.52, 13.405, 'Europe/Berlin'),
  city('amsterdam', '阿姆斯特丹', 'Amsterdam', 'NL', 52.3676, 4.9041, 'Europe/Amsterdam'),
  city('new-york', '紐約', 'New York', 'US', 40.7128, -74.006, 'America/New_York', ['纽约', 'NYC']),
  city('boston', '波士頓', 'Boston', 'US', 42.3601, -71.0589, 'America/New_York', ['波士顿']),
  city('los-angeles', '洛杉磯', 'Los Angeles', 'US', 34.0522, -118.2437, 'America/Los_Angeles', ['洛杉矶', 'LA']),
  city('san-francisco', '舊金山', 'San Francisco', 'US', 37.7749, -122.4194, 'America/Los_Angeles', ['旧金山', 'SF']),
  city('seattle', '西雅圖', 'Seattle', 'US', 47.6062, -122.3321, 'America/Los_Angeles', ['西雅图']),
  city('chicago', '芝加哥', 'Chicago', 'US', 41.8781, -87.6298, 'America/Chicago'),
  city('houston', '休士頓', 'Houston', 'US', 29.7604, -95.3698, 'America/Chicago', ['休斯顿', '休斯頓']),
  city('vancouver', '溫哥華', 'Vancouver', 'CA', 49.2827, -123.1207, 'America/Vancouver', ['温哥华']),
  city('toronto', '多倫多', 'Toronto', 'CA', 43.6532, -79.3832, 'America/Toronto', ['多伦多']),
]);

export const CITIES: readonly City[] = Object.freeze([...TAIWAN_CITIES, ...OVERSEAS_CITIES]);

/** 正規化查詢字串：小寫、去空白與連字號、臺→台、去掉「市／縣」字尾。 */
function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/臺/g, '台')
    .replace(/[\s\-_.,]/g, '')
    .replace(/(市|縣|县)$/, '');
}

function keysOf(c: City): string[] {
  return [c.id, c.nameZh, c.nameEn, ...(c.aliases ?? [])].map(normalize);
}

/**
 * Find a city by id, Chinese name or English name (case-insensitive; 臺/台 and
 * the 市/縣 suffix are ignored). Returns `null` when no exact key match exists.
 * Ambiguous short keys resolve to the first table entry (e.g. 'Hsinchu' → 新竹市).
 */
export function findCity(query: string): City | null {
  if (typeof query !== 'string') return null;
  const q = normalize(query);
  if (q === '') return null;
  return CITIES.find((c) => keysOf(c).includes(q)) ?? null;
}

/** Convert a city entry into a BirthProfile birthplace. */
export function cityToBirthplace(c: City): Birthplace {
  const countryLabel = c.country === 'TW' ? 'Taiwan' : c.country;
  return { label: `${c.nameEn}, ${countryLabel}`, lat: c.lat, lng: c.lng, timezone: c.timezone };
}

/** 預設出生地：臺北市政府。 */
export const DEFAULT_BIRTHPLACE: Readonly<Birthplace> = Object.freeze(
  cityToBirthplace(TAIWAN_CITIES[0]),
);
