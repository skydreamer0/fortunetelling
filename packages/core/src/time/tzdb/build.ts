/**
 * @fileoverview 產生 `data.ts`（內建時區資料庫）。只在更新 tz 版本時由維護者手動執行，執行期不會載入。
 *
 * 用法（在 repo 根目錄）：
 *
 *   1. 下載官方資料並解壓：https://data.iana.org/time-zones/releases/tzdata<版本>.tar.gz
 *      （IANA tz 資料庫，公有領域 public domain）
 *   2. bun packages/core/src/time/tzdb/build.ts <解壓後的目錄>
 *   3. bun test packages/core/tests/timeTzdb.test.ts packages/core/tests/timeHistorical.test.ts
 *
 * 需要 `awk`（Git Bash、macOS、Linux 皆內建）：用 tz 官方的 `ziguard.awk` 產生兩份 zic 輸入，
 * 與官方 Makefile 的 `PACKRATDATA=backzone PACKRATLIST=zone.tab`、`DATAFORM=rearguard` 相同：
 *
 * - 產品用：rearguard 格式（夏令 SAVE 一律為正）＋ backzone（只取 zone.tab 列出的時區）。
 *   tz 自 2022 年起把「1970 年後相同」的時區合併（例如 Atlantic/Reykjavik → Africa/Abidjan、
 *   Europe/Oslo → Europe/Berlin），1970 年前各自的歷史移到 backzone；一般 ICU（瀏覽器、Node、Bun）
 *   不含 backzone，所以出生在 1970 年前的人會被套上別國的歷史。
 * - 對照用：只有主資料的 rearguard，用來標出「哪段時間的資料來自 backzone」。
 *
 * 產生後會自我驗證：每個時區在 1800–2200 年的每個轉換前後，解碼結果都必須與完整編譯結果相同。
 * @module time/tzdb/build
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileZone, daysFromCivil, parseTzSource, typeAt, type CompiledZone, type ParsedTz, type PeriodType, type Rule } from './compile';
import { decodeZone, encodeZone, tailTransitionsOfYear, zoneTypeAtSec, type DecodedZone, type Tail, type ZoneType } from './format';

const MAX_YEAR = 2201;
const LO = daysFromCivil(1800, 1, 1) * 86_400;
const HI = daysFromCivil(2201, 1, 1) * 86_400;
const DATA_FILES = ['africa', 'antarctica', 'asia', 'australasia', 'europe', 'northamerica', 'southamerica', 'etcetera', 'factory', 'backward'];

function ziguard(dir: string, packrat: boolean): string {
  // 與官方 Makefile 相同，在資料目錄內以相對檔名執行：ziguard.awk 以 `FILENAME == PACKRATDATA`
  // 與 `#PACKRATLIST zone.tab` 比對，傳絕對路徑會讓 PACKRATLIST 篩選失效（變成整份 backzone）。
  const args = ['-v', 'DATAFORM=rearguard', '-v', `PACKRATDATA=${packrat ? 'backzone' : ''}`, '-v', `PACKRATLIST=${packrat ? 'zone.tab' : ''}`];
  args.push('-f', 'ziguard.awk', ...DATA_FILES);
  if (packrat) args.push('backzone');
  return execFileSync('awk', args, { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function resolveName(src: ParsedTz, name: string, useHint: boolean): string | null {
  const seen = new Set<string>();
  let n = name;
  while (!src.zones.has(n)) {
    const l = src.links.get(n);
    if (!l || seen.has(n)) return null;
    seen.add(n);
    n = useHint && l.hint && src.zones.has(l.hint) ? l.hint : l.target;
  }
  return n;
}

const sameType = (a: ZoneType, b: ZoneType) => a.utoff === b.utoff && a.stdoff === b.stdoff && a.isDst === b.isDst && a.isLmt === b.isLmt;

/** 找最早可以改用尾段規則的年份；找不到就回傳 null（全部轉換都存下來）。 */
function findTail(name: string, src: ParsedTz, compiled: CompiledZone): Tail | null {
  const lines = src.zones.get(name)!;
  const last = lines[lines.length - 1];
  if (typeof last.rules !== 'string') return null;
  const set = src.rules.get(last.rules)!;
  const maxRules = set.filter((r) => r.to === Infinity);
  if (maxRules.length === 0) return null;
  const others = set.filter((r) => r.to !== Infinity);
  const prevUntilYear = lines.length >= 2 ? lines[lines.length - 2].until!.year : -Infinity;
  const firstYear = Math.max(prevUntilYear + 1, ...maxRules.map((r) => r.from), ...others.map((r: Rule) => r.to + 1), 1800);
  const tailRules = maxRules.map((r) => ({ month: r.month, day: r.day, atSec: r.atSec, atType: r.atType, save: r.save, isDst: r.isDst }));
  for (let y = firstYear; y <= 2200; y++) {
    const tail: Tail = { start: 0, stdoff: last.stdoff, rules: tailRules };
    const gen: { at: number; type: ZoneType }[] = [];
    for (let yy = y; yy < MAX_YEAR; yy++) gen.push(...tailTransitionsOfYear(tail, yy));
    if (gen.length === 0) return null;
    tail.start = gen[0].at;
    let prev: ZoneType = typeAt(compiled, tail.start - 1);
    const dedup = gen.filter((g) => {
      const keep = !sameType(prev, g.type);
      prev = g.type;
      return keep;
    });
    const expect = compiled.transitions.filter((t) => t.at >= tail.start && t.at < HI);
    if (dedup.length === expect.length && dedup.every((g, i) => g.at === expect[i].at && sameType(g.type, expect[i].type))) {
      return tail;
    }
  }
  return null;
}

function toDecoded(compiled: CompiledZone, tail: Tail | null, backzoneUntil: number | null): DecodedZone {
  const types: ZoneType[] = [];
  const typeIndex = (t: PeriodType): number => {
    let i = types.findIndex((x) => sameType(x, t));
    if (i < 0) i = types.push({ utoff: t.utoff, stdoff: t.stdoff, isDst: t.isDst, isLmt: t.isLmt }) - 1;
    return i;
  };
  typeIndex(compiled.initial);
  const kept = compiled.transitions.filter((t) => (tail ? t.at < tail.start : t.at < HI));
  return { types, at: kept.map((t) => t.at), idx: kept.map((t) => typeIndex(t.type)), tail, backzoneUntil };
}

/** 兩份編譯結果最後一次不同之後的第一個轉換瞬間；完全相同時為 null。 */
function divergenceEnd(a: CompiledZone, b: CompiledZone): number | null {
  const points = [...new Set([...a.transitions, ...b.transitions].map((t) => t.at))].filter((p) => p < HI).sort((x, y) => x - y);
  const differs = (p: number) => typeAt(a, p).utoff !== typeAt(b, p).utoff;
  let end: number | null = differs(-Infinity) ? (points[0] ?? null) : null;
  for (let i = 0; i < points.length; i++) {
    if (differs(points[i])) end = points[i + 1] ?? HI;
  }
  return end;
}

function verify(name: string, compiled: CompiledZone, encoded: string): void {
  const z = decodeZone(encoded);
  const pts: number[] = [LO];
  for (const t of compiled.transitions) if (t.at >= LO && t.at < HI) pts.push(t.at - 1, t.at, t.at + 43_200);
  for (let s = LO; s < HI; s += 7_776_000 + 3_607) pts.push(s);
  for (const p of pts) {
    const a = typeAt(compiled, p);
    const b = zoneTypeAtSec(z, p);
    if (!sameType(a, b)) throw new Error(`${name} 在 ${new Date(p * 1000).toISOString()} 解碼不一致：${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  }
}

function main(): void {
  const dir = process.argv[2];
  if (!dir) throw new Error('用法：bun packages/core/src/time/tzdb/build.ts <tzdata 目錄>');
  const version = readFileSync(join(dir, 'version'), 'utf8').trim();
  const back = parseTzSource(ziguard(dir, true));
  const main = parseTzSource(ziguard(dir, false));

  const names = [...back.zones.keys(), ...back.links.keys()].filter((n) => n !== 'Factory').sort();
  const zones: Record<string, string> = {};
  const links: Record<string, string> = {};
  const byEncoding = new Map<string, string>();
  const canonical = [...new Set(names.map((n) => resolveName(back, n, true)!))].sort();
  for (const name of canonical) {
    const compiled = compileZone(name, back.zones.get(name)!, back.rules, MAX_YEAR);
    const mainName = resolveName(main, name, false);
    const bz = mainName ? divergenceEnd(compiled, compileZone(mainName, main.zones.get(mainName)!, main.rules, MAX_YEAR)) : null;
    const tail = findTail(name, back, compiled);
    const encoded = encodeZone(toDecoded(compiled, tail, bz));
    verify(name, compiled, encoded);
    const same = byEncoding.get(encoded);
    if (same) links[name] = same;
    else {
      zones[name] = encoded;
      byEncoding.set(encoded, name);
    }
  }
  for (const n of names) {
    const target = resolveName(back, n, true)!;
    if (n !== target) links[n] = links[target] ?? target;
  }

  const sortObj = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
  const out = [
    '/**',
    ' * @fileoverview 內建時區資料庫（自動產生，請勿手動修改；更新方式見 `build.ts`）。',
    ` * 來源：IANA tz 資料庫 ${version}（公有領域），rearguard 格式＋backzone（PACKRATLIST=zone.tab）。`,
    ' * 編碼格式見 `format.ts`。',
    ' * @module time/tzdb/data',
    ' */',
    '',
    `export const TZDB_VERSION = '${version}';`,
    '',
    `export const TZDB_ZONES: Readonly<Record<string, string>> = ${JSON.stringify(sortObj(zones), null, 1)};`,
    '',
    `export const TZDB_LINKS: Readonly<Record<string, string>> = ${JSON.stringify(sortObj(links), null, 1)};`,
    '',
  ].join('\n');
  const target = join(import.meta.dirname ?? '.', 'data.ts');
  writeFileSync(target, out);
  console.log(`tz ${version}：${Object.keys(zones).length} 個時區、${Object.keys(links).length} 個別名，${out.length} 字元 → ${target}`);
}

main();
