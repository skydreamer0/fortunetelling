/**
 * @fileoverview IANA tz 原始資料（zic 輸入格式）編譯器——只在「產生 `data.ts`」時使用，
 * 執行期不會載入（見 `build.ts`）。
 *
 * 這是 zic（tz 官方編譯器，tzcode `zic.c` 的 `outzone()`／`writezone()`）的 TypeScript
 * 重寫，只保留我們需要的部分：UTC 偏移、是否夏令、是否為地方平時（LMT）。
 * 時間一律以「自 1970-01-01T00:00:00Z 起的秒數」表示（可為負）。
 *
 * 正確性：`tests/timeTzdb.test.ts` 以本編譯器編譯 2026a 的主資料，與 Node（ICU 78.2、
 * tz 2026a）的 `Intl` 在所有時區、所有轉換點前後逐秒比對，必須完全一致。
 * @module time/tzdb/compile
 */

const DAY = 86_400;

/** 'Jan'..'Dec'（zic 接受唯一前綴）。 */
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** 自 1970-01-01 起的日數（proleptic Gregorian；Howard Hinnant 的 days_from_civil）。 */
export function daysFromCivil(y: number, m: number, d: number): number {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** 0 = 星期日。 */
export function weekdayOfDays(days: number): number {
  return (((days + 4) % 7) + 7) % 7;
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function monthLength(y: number, m: number): number {
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

function lookupPrefix(word: string, table: string[], what: string): number {
  const w = word.toLowerCase();
  const hits = table.map((t, i) => (t.startsWith(w) ? i : -1)).filter((i) => i >= 0);
  if (hits.length !== 1) throw new Error(`無法辨識的${what}：${word}`);
  return hits[0];
}

/** 'h[:mm[:ss[.frac]]]'（可負）→ 秒，四捨五入到整秒（zic 對小數秒也是取最接近的整秒）。 */
export function parseHms(text: string): number {
  if (text === '-') return 0;
  const neg = text.startsWith('-');
  const parts = (neg ? text.slice(1) : text).split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) throw new Error(`無法辨識的時間：${text}`);
  const [h, m = '0', s = '0'] = parts;
  const sec = Number(h) * 3600 + Number(m) * 60 + Math.round(Number(s));
  return neg ? -sec : sec;
}

/** 時刻後綴：w＝當地牆鐘、s＝當地標準時間、u＝UTC（g、z 同 u）。 */
export type AtType = 'w' | 's' | 'u';

function parseAt(text: string): { sec: number; type: AtType } {
  const m = /^(.*?)([wsugz])?$/.exec(text)!;
  const suffix = m[2];
  const type: AtType = suffix === 's' ? 's' : suffix === 'u' || suffix === 'g' || suffix === 'z' ? 'u' : 'w';
  return { sec: parseHms(m[1] === '' ? '0' : m[1]), type };
}

/** ON 欄位：固定日、`lastSun`、`Sun>=8`、`Sun<=25`。 */
export type DaySpec =
  | { kind: 'dom'; day: number }
  | { kind: 'last'; weekday: number }
  | { kind: 'geq' | 'leq'; weekday: number; day: number };

function parseDay(text: string): DaySpec {
  if (/^\d+$/.test(text)) return { kind: 'dom', day: Number(text) };
  if (/^last/i.test(text)) return { kind: 'last', weekday: lookupPrefix(text.slice(4), WEEKDAYS, '星期') };
  const m = /^([A-Za-z]+)([<>]=)(\d+)$/.exec(text);
  if (!m) throw new Error(`無法辨識的日期：${text}`);
  return { kind: m[2] === '>=' ? 'geq' : 'leq', weekday: lookupPrefix(m[1], WEEKDAYS, '星期'), day: Number(m[3]) };
}

/** 某年某月 DaySpec 對應的「自 1970 起日數」（`Sun>=31` 之類可跨到下個月，與 zic 相同）。 */
export function daysOf(year: number, month: number, spec: DaySpec): number {
  if (spec.kind === 'dom') return daysFromCivil(year, month, spec.day);
  if (spec.kind === 'last') {
    const d = daysFromCivil(year, month, monthLength(year, month));
    return d - ((weekdayOfDays(d) - spec.weekday + 7) % 7);
  }
  const d = daysFromCivil(year, month, spec.day);
  if (spec.kind === 'geq') return d + ((spec.weekday - weekdayOfDays(d) + 7) % 7);
  return d - ((weekdayOfDays(d) - spec.weekday + 7) % 7);
}

export type Rule = {
  from: number;
  /** Infinity = max */
  to: number;
  month: number;
  day: DaySpec;
  atSec: number;
  atType: AtType;
  save: number;
  isDst: boolean;
};

export type ZoneLine = {
  stdoff: number;
  /** null = '-'；number = 固定的 SAVE；string = 規則名稱。 */
  rules: null | number | string;
  fixedIsDst: boolean;
  format: string;
  /** 結束時刻（當地「名目」秒數，尚未依 untilType 換算）；null = 最後一行。 */
  until: null | { naiveSec: number; type: AtType; year: number };
};

export type ParsedTz = {
  rules: Map<string, Rule[]>;
  zones: Map<string, ZoneLine[]>;
  /** name → target，以及 ziguard 在連結上註記的 `#= 真正的時區`。 */
  links: Map<string, { target: string; hint: string | null }>;
};

function parseSave(text: string): { save: number; isDst: boolean } {
  const m = /^(.*?)([sd])?$/.exec(text)!;
  const save = parseHms(m[1]);
  return { save, isDst: m[2] === 'd' ? true : m[2] === 's' ? false : save !== 0 };
}

function parseUntil(fields: string[]): ZoneLine['until'] {
  if (fields.length === 0) return null;
  const year = Number(fields[0]);
  const month = fields[1] ? lookupPrefix(fields[1], MONTHS, '月份') + 1 : 1;
  const day = fields[2] ? daysOf(year, month, parseDay(fields[2])) : daysFromCivil(year, month, 1);
  const at = fields[3] ? parseAt(fields[3]) : { sec: 0, type: 'w' as AtType };
  return { naiveSec: day * DAY + at.sec, type: at.type, year };
}

function parseZoneFields(f: string[]): ZoneLine {
  const stdoff = parseHms(f[0]);
  let rules: ZoneLine['rules'] = null;
  let fixedIsDst = false;
  if (f[1] !== '-') {
    if (/^-?\d/.test(f[1])) {
      const s = parseSave(f[1]);
      rules = s.save;
      fixedIsDst = s.isDst;
    } else rules = f[1];
  }
  return { stdoff, rules, fixedIsDst, format: f[2], until: parseUntil(f.slice(3)) };
}

/** 解析 zic 輸入文字（可為多個檔案串接）。 */
export function parseTzSource(text: string): ParsedTz {
  const out: ParsedTz = { rules: new Map(), zones: new Map(), links: new Map() };
  let current: ZoneLine[] | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const hashAt = raw.indexOf('#');
    const comment = hashAt >= 0 ? raw.slice(hashAt + 1) : '';
    const line = hashAt >= 0 ? raw.slice(0, hashAt) : raw;
    const f = line.trim().split(/\s+/).filter(Boolean);
    if (f.length === 0) continue;
    const continuation = /^\s/.test(line);
    if (continuation) {
      if (!current) throw new Error(`孤立的續行：${raw}`);
      current.push(parseZoneFields(f));
      if (current[current.length - 1].until === null) current = null;
      continue;
    }
    current = null;
    const kind = f[0].toLowerCase();
    if (kind === 'rule' || kind === 'r') {
      const [, name, fromS, toS, , inS, onS, atS, saveS] = f;
      const from = fromS.toLowerCase().startsWith('mi') ? -Infinity : Number(fromS);
      const toL = toS.toLowerCase();
      const to = 'only'.startsWith(toL) ? from : 'maximum'.startsWith(toL) && toL.startsWith('ma') ? Infinity : Number(toS);
      const at = parseAt(atS);
      const save = parseSave(saveS);
      const rule: Rule = {
        from,
        to,
        month: lookupPrefix(inS, MONTHS, '月份') + 1,
        day: parseDay(onS),
        atSec: at.sec,
        atType: at.type,
        save: save.save,
        isDst: save.isDst,
      };
      if (!out.rules.has(name)) out.rules.set(name, []);
      out.rules.get(name)!.push(rule);
    } else if (kind === 'zone' || kind === 'z') {
      const lines = [parseZoneFields(f.slice(2))];
      out.zones.set(f[1], lines);
      if (lines[0].until !== null) current = lines;
    } else if (kind === 'link' || kind === 'l') {
      const hint = /^\s*=\s*(\S+)/.exec(comment)?.[1] ?? null;
      out.links.set(f[2], { target: f[1], hint });
    } else {
      throw new Error(`無法辨識的資料列：${raw}`);
    }
  }
  return out;
}

/** 一段期間的「型別」：UTC 偏移（秒）、是否夏令、是否為地方平時（tz 的 LMT 行）。 */
export type PeriodType = { utoff: number; isDst: boolean; isLmt: boolean; stdoff: number };
export type Transition = { at: number; type: PeriodType };
export type CompiledZone = { initial: PeriodType; transitions: Transition[] };

function sameType(a: PeriodType, b: PeriodType): boolean {
  return a.utoff === b.utoff && a.isDst === b.isDst && a.isLmt === b.isLmt && a.stdoff === b.stdoff;
}

/** 規則在某年的「名目」秒數（當地日期＋AT，尚未依 atType 換算）。 */
export function ruleNaiveSec(rule: Pick<Rule, 'month' | 'day' | 'atSec'>, year: number): number {
  return daysOf(year, rule.month, rule.day) * DAY + rule.atSec;
}

/**
 * 依 zic `outzone()` 的演算法把一個時區編譯成轉換列表，直到 `maxYear` 年底。
 * 保留 zic 的細節：每行開始時 `save` 先設為 0；Zone 行起點之前的規則只用來決定起點的偏移；
 * UNTIL 以「目前這一行」的 stdoff／save 換算；最後依 `writezone()` 合併同一瞬間的轉換。
 */
export function compileZone(name: string, lines: ZoneLine[], allRules: Map<string, Rule[]>, maxYear: number): CompiledZone {
  const out: Transition[] = [];
  let save = 0;
  let starttime = -Infinity;
  let initial: PeriodType | null = null;

  lines.forEach((zp, i) => {
    // zic：「A guess that may well be corrected later.」每一行開始時先假設 save = 0；
    // 上一行的 save 只用在換算上一行的 UNTIL（已存在 starttime）。
    save = 0;
    let usestart = i > 0 && starttime > -Infinity;
    const useuntil = zp.until !== null;
    const stdoff = zp.stdoff;
    const isLmt = zp.format === 'LMT';
    let startoff = stdoff;

    if (typeof zp.rules !== 'string') {
      save = zp.rules ?? 0;
      const type: PeriodType = { utoff: stdoff + save, isDst: zp.fixedIsDst, isLmt, stdoff };
      if (usestart) {
        out.push({ at: starttime, type });
        usestart = false;
      } else if (!initial) initial = type;
    } else {
      const rules = allRules.get(zp.rules);
      if (!rules) throw new Error(`${name}：找不到規則 ${zp.rules}`);
      const minYear = Math.max(1700, Math.min(...rules.map((r) => r.from)));
      const lastYear = useuntil ? zp.until!.year : maxYear;
      for (let year = minYear; year <= lastYear; year++) {
        const todo = rules.map((r) => year >= r.from && year <= r.to);
        const naive = rules.map((r) => ruleNaiveSec(r, year));
        for (;;) {
          let untiltime = Infinity;
          if (useuntil) {
            untiltime = zp.until!.naiveSec;
            if (zp.until!.type !== 'u') untiltime -= stdoff;
            if (zp.until!.type === 'w') untiltime -= save;
          }
          let k = -1;
          let ktime = 0;
          for (let j = 0; j < rules.length; j++) {
            if (!todo[j]) continue;
            const r = rules[j];
            let offset = r.atType === 'u' ? 0 : stdoff;
            if (r.atType === 'w') offset += save;
            const jtime = naive[j] - offset;
            if (k < 0 || jtime < ktime) {
              k = j;
              ktime = jtime;
            } else if (jtime === ktime) {
              throw new Error(`${name}：兩條規則在同一瞬間（${year}）`);
            }
          }
          if (k < 0) break;
          const rp = rules[k];
          todo[k] = false;
          if (useuntil && ktime >= untiltime) {
            break;
          }
          save = rp.save;
          if (usestart && ktime === starttime) usestart = false;
          if (usestart) {
            if (ktime < starttime) {
              startoff = stdoff + save;
              continue;
            }
          }
          const type: PeriodType = { utoff: stdoff + rp.save, isDst: rp.isDst, isLmt, stdoff };
          if (!initial && !rp.isDst) initial = type;
          out.push({ at: ktime, type });
        }
      }
      if (usestart) {
        // 與 zic 相同：起點是否夏令以「偏移是否不等於 stdoff」判斷。
        const isDst = startoff !== stdoff;
        const type: PeriodType = { utoff: startoff, isDst, isLmt, stdoff };
        out.push({ at: starttime, type });
      }
      if (!initial) initial = { utoff: stdoff, isDst: false, isLmt, stdoff };
    }
    if (useuntil) {
      starttime = zp.until!.naiveSec;
      if (zp.until!.type === 'w') starttime -= save;
      if (zp.until!.type !== 'u') starttime -= stdoff;
    }
  });

  // writezone()：排序後，若某轉換的「當地時刻」不晚於前一個轉換的當地時刻，就以它取代前一個；
  // 型別相同的相鄰轉換合併。
  out.sort((a, b) => a.at - b.at);
  const merged: Transition[] = [];
  for (const t of out) {
    if (merged.length > 0) {
      const prev = merged[merged.length - 1];
      const beforePrev = merged.length >= 2 ? merged[merged.length - 2].type : initial!;
      if (t.at + prev.type.utoff <= prev.at + beforePrev.utoff) {
        prev.type = t.type;
        continue;
      }
    }
    const last = merged.length > 0 ? merged[merged.length - 1].type : initial!;
    if (!sameType(last, t.type)) merged.push({ at: t.at, type: t.type });
  }
  // 取代後可能讓相鄰兩段型別相同，再掃一次。
  const cleaned: Transition[] = [];
  for (const t of merged) {
    const last = cleaned.length > 0 ? cleaned[cleaned.length - 1].type : initial!;
    if (!sameType(last, t.type)) cleaned.push(t);
  }
  return { initial: initial!, transitions: cleaned };
}

/** 某瞬間的期間型別（二分搜尋）。 */
export function typeAt(zone: CompiledZone, at: number): PeriodType {
  const t = zone.transitions;
  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid].at <= at) lo = mid + 1;
    else hi = mid;
  }
  return lo === 0 ? zone.initial : t[lo - 1].type;
}
