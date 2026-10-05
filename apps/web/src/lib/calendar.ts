/**
 * 首頁表單專用的輕量曆法橋接：國曆日期的解析／格式化是純函式，直接在這裡實作；
 * 國曆↔農曆換算需要 lunar-javascript，所以走動態 import（第一次用到才載入計算核心）。
 * 報告端元件仍使用 ./core（靜態橋接），它們本身已在延遲載入的 chunk 內。
 */

import type { LunarInput } from '../model/types';

export interface YMD { year: number; month: number; day: number }

const pad = (value: number) => String(value).padStart(2, '0');

/** 與 @fortune/core 的 toIsoDate 相同。 */
export const toIsoDate = ({ year, month, day }: YMD): string => `${year}-${pad(month)}-${pad(day)}`;

/** 與 @fortune/core 的 parseIsoDate 相同（含錯誤訊息）。 */
export function parseIsoDate(value: unknown): YMD {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
  if (!match) throw new Error('請選擇有效的出生日期');
  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error('這個國曆日期不存在');
  }
  return { year, month, day };
}

type CoreBridge = typeof import('./core');
let bridge: CoreBridge | null = null;
let pending: Promise<CoreBridge> | null = null;

/** 載入（並快取）計算核心；失敗時清掉快取，下次可重試。 */
export function loadCore(): Promise<CoreBridge> {
  pending ??= import('./core').then(
    loadedModule => (bridge = loadedModule),
    error => { pending = null; throw error; },
  );
  return pending;
}

function loaded(): CoreBridge {
  if (!bridge) throw new Error('計算核心尚未載入，請稍候再試');
  return bridge;
}

/** 需先 `await loadCore()`。 */
export const solarToLunarDate = (date: YMD): LunarInput => loaded().solarToLunarDate(date);
/** 需先 `await loadCore()`。 */
export const lunarToSolarDate = (date: LunarInput): YMD & { iso: string } => loaded().lunarToSolarDate(date);
