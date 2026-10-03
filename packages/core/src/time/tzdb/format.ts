/**
 * @fileoverview 內建時區資料庫的編碼格式與查詢（執行期與 `build.ts` 共用）。
 *
 * 一個時區編成一個字串，四段以 `|` 分隔（數字皆為 36 進位、可帶負號，單位為秒）：
 *
 * 0. 期間型別：`utoff,stdoff,旗標` 以 `;` 分隔；旗標 `d`＝夏令、`l`＝地方平時（tz 的 LMT 行）。
 *    第 0 個是「最早的轉換之前」的型別。
 * 1. 轉換：`與前一個轉換的秒差,型別索引` 以 `;` 分隔（第一個為自 1970 起的絕對秒數）。
 * 2. 尾段規則（可空）：`起點;stdoff;規則;規則…`，規則為
 *    `月,日,AT 秒,AT 類型(w/s/u),SAVE,是否夏令(0/1)`；日為 `d15`（固定日）、`l0`（該月最後一個星期日）、
 *    `g0.8`（8 日或之後第一個星期日）、`k0.25`（25 日或之前最後一個星期日）。
 *    瞬間 ≥ 起點時改由尾段規則逐年推算（與 zic 的 TZ 字串同義），所以不必列出到 2200 年的每一次轉換。
 * 3. backzone 界線（可空）：早於此瞬間的資料來自 tz 的 `backzone`（主資料庫已合併的 1970 年前歷史），
 *    之後與主資料庫相同。
 * @module time/tzdb/format
 */

import { daysOf, daysFromCivil, type AtType, type DaySpec } from './compile';

const DAY = 86_400;

export type ZoneType = { utoff: number; stdoff: number; isDst: boolean; isLmt: boolean };

export type TailRule = { month: number; day: DaySpec; atSec: number; atType: AtType; save: number; isDst: boolean };
export type Tail = { start: number; stdoff: number; rules: TailRule[] };

export type DecodedZone = {
  types: ZoneType[];
  at: number[];
  idx: number[];
  tail: Tail | null;
  /** 早於此瞬間（秒）的資料來自 backzone；null＝與主資料庫完全相同。 */
  backzoneUntil: number | null;
};

const b36 = (n: number): string => (n < 0 ? `-${(-n).toString(36)}` : n.toString(36));
const un36 = (s: string): number => (s.startsWith('-') ? -parseInt(s.slice(1), 36) : parseInt(s, 36));

function encodeDay(d: DaySpec): string {
  if (d.kind === 'dom') return `d${d.day}`;
  if (d.kind === 'last') return `l${d.weekday}`;
  return `${d.kind === 'geq' ? 'g' : 'k'}${d.weekday}.${d.day}`;
}

function decodeDay(s: string): DaySpec {
  const body = s.slice(1);
  if (s[0] === 'd') return { kind: 'dom', day: Number(body) };
  if (s[0] === 'l') return { kind: 'last', weekday: Number(body) };
  const [w, d] = body.split('.').map(Number);
  return { kind: s[0] === 'g' ? 'geq' : 'leq', weekday: w, day: d };
}

export function encodeZone(z: DecodedZone): string {
  const types = z.types.map((t) => `${b36(t.utoff)},${b36(t.stdoff)},${t.isDst ? 'd' : ''}${t.isLmt ? 'l' : ''}`).join(';');
  let prev = 0;
  const trans = z.at
    .map((at, i) => {
      const s = `${b36(at - prev)},${z.idx[i].toString(36)}`;
      prev = at;
      return s;
    })
    .join(';');
  const tail = z.tail
    ? [
        b36(z.tail.start),
        b36(z.tail.stdoff),
        ...z.tail.rules.map((r) => [r.month, encodeDay(r.day), b36(r.atSec), r.atType, b36(r.save), r.isDst ? 1 : 0].join(',')),
      ].join(';')
    : '';
  const bz = z.backzoneUntil === null ? '' : b36(z.backzoneUntil);
  return [types, trans, tail, bz].join('|');
}

export function decodeZone(s: string): DecodedZone {
  const [typesS, transS, tailS, bzS] = s.split('|');
  const types = typesS.split(';').map((t) => {
    const [u, st, f] = t.split(',');
    return { utoff: un36(u), stdoff: un36(st), isDst: f.includes('d'), isLmt: f.includes('l') };
  });
  const at: number[] = [];
  const idx: number[] = [];
  let prev = 0;
  if (transS) {
    for (const t of transS.split(';')) {
      const [d, i] = t.split(',');
      prev += un36(d);
      at.push(prev);
      idx.push(parseInt(i, 36));
    }
  }
  let tail: Tail | null = null;
  if (tailS) {
    const [start, stdoff, ...rules] = tailS.split(';');
    tail = {
      start: un36(start),
      stdoff: un36(stdoff),
      rules: rules.map((r) => {
        const [month, day, atSec, atType, save, isDst] = r.split(',');
        return { month: Number(month), day: decodeDay(day), atSec: un36(atSec), atType: atType as AtType, save: un36(save), isDst: isDst === '1' };
      }),
    };
  }
  return { types, at, idx, tail, backzoneUntil: bzS ? un36(bzS) : null };
}

/** 尾段規則在某年的轉換（依當地名目時刻排序；第一條的「之前的 save」取該年最後一條的 save）。 */
export function tailTransitionsOfYear(tail: Tail, year: number): { at: number; type: ZoneType }[] {
  const rs = tail.rules
    .map((r) => ({ r, naive: daysOf(year, r.month, r.day) * DAY + r.atSec }))
    .sort((a, b) => a.naive - b.naive);
  return rs.map(({ r, naive }, i) => {
    const prevSave = rs[(i + rs.length - 1) % rs.length].r.save;
    const offset = r.atType === 'u' ? 0 : r.atType === 's' ? tail.stdoff : tail.stdoff + prevSave;
    return { at: naive - offset, type: { utoff: tail.stdoff + r.save, stdoff: tail.stdoff, isDst: r.isDst, isLmt: false } };
  });
}

function utcYearOf(sec: number): number {
  return new Date(sec * 1000).getUTCFullYear();
}

/** 某瞬間（自 1970 起秒數）的期間型別。 */
export function zoneTypeAtSec(z: DecodedZone, sec: number): ZoneType {
  if (z.tail && sec >= z.tail.start) {
    const y = utcYearOf(sec);
    let best: ZoneType | null = null;
    for (const yy of [y - 1, y, y + 1]) {
      for (const t of tailTransitionsOfYear(z.tail, yy)) if (t.at <= sec) best = t.type;
    }
    if (best) return best;
  }
  let lo = 0;
  let hi = z.at.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (z.at[mid] <= sec) lo = mid + 1;
    else hi = mid;
  }
  return z.types[lo === 0 ? 0 : z.idx[lo - 1]];
}

/** 1970-01-01 以前（不含）的瞬間：tz 官方說明此範圍的資料可信度較低。 */
export const TZ_RELIABLE_FROM_SEC = daysFromCivil(1970, 1, 1) * DAY;
