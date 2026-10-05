/** Birthplace picker data: the core offline city table, searched by 中文 / English / alias. */

// 直接引用城市表檔案，而不是 '@fortune/core' 的 barrel：barrel 會讓打包器保留整個核心的副作用 import，
// 首頁就得連同 ~850 kB 的計算核心一起下載。城市表是純資料，沒有任何副作用。
import { OVERSEAS_CITIES, TAIWAN_CITIES, type City } from '../../../../packages/core/src/profile/cities';

export type { City };

export const DEFAULT_CITY_ID = 'taipei';

/** Lower-case, drop spaces/punctuation, 臺→台 (users type both). */
export function normalizeCityQuery(text: string): string {
  return text.trim().toLowerCase().replace(/臺/g, '台').replace(/[\s\-_.,，、]/g, '');
}

function haystack(city: City): string[] {
  return [city.id, city.nameZh, city.nameEn, ...(city.aliases ?? [])].map(normalizeCityQuery);
}

export function matchesCity(city: City, query: string): boolean {
  const q = normalizeCityQuery(query);
  return q === '' || haystack(city).some(key => key.includes(q));
}

/** Filter both groups by substring; an empty query returns everything. */
export function searchCities(query: string): { taiwan: City[]; overseas: City[] } {
  return {
    taiwan: TAIWAN_CITIES.filter(city => matchesCity(city, query)),
    overseas: OVERSEAS_CITIES.filter(city => matchesCity(city, query)),
  };
}

export function cityById(id: string | undefined | null): City | null {
  if (!id) return null;
  return TAIWAN_CITIES.find(city => city.id === id) ?? OVERSEAS_CITIES.find(city => city.id === id) ?? null;
}

/** 「臺南市」 for Taiwan, 「東京（JP）」 overseas. */
export function cityLabel(city: City): string {
  return city.country === 'TW' ? city.nameZh : `${city.nameZh}（${city.country}）`;
}
