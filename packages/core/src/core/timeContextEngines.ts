/**
 * @fileoverview TimeContext-aware 八字 / 紫微 engines for `analyze()` (Report v4, D-032).
 *
 * Both subclasses keep the v1 engines as the single source of the component
 * SHAPE (ids, names, categories, value keys — so LayerClassifier, radars,
 * summary, insights, evolution and the web selectors are untouched) but feed
 * them the time resolved by the ① time layer (D-026):
 *
 * ## 八字 (`TimeContextBaZiEngine`)
 * 1. The engine runs on the RESOLVED WALL CLOCK of `computePillars`
 *    (birthplace true solar time by default, local civil time with
 *    `useTrueSolarTime: false`) — this is what fixes the day/hour pillars.
 * 2. The natal components (natal, day_master, elements, ten_gods,
 *    tenGodsContext) are then REBUILT from `computePillars(ctx).pillars` with
 *    `buildBaziNatalComponents`, the very function the engine uses. This
 *    matters where the engine cannot express the right pillar:
 *    - year/month: lunar-javascript compares the wall clock with 節 instants
 *      on a fixed UTC+8 clock, so a birth outside UTC+8 (or a Taiwan DST wall
 *      clock, or a true-solar clock minutes off CST) near a 節 gets the wrong
 *      month (and, at 立春, year) pillar. `computePillars` compares the birth
 *      INSTANT with the exact 節 instant instead;
 *    - hour/day with `ziHourConvention: 'early'` (the engine is fixed to sect=2).
 *    Fields where the engine's own wall-clock pillars differ are listed in
 *    `meta.timeConvention.overriddenFields` (usually empty).
 * 3. `daYun_1…10` come from `luckCycles(ctx)`: direction from the 立春-exact
 *    year pillar, sequence from the exact-節 month pillar, 起運 from the exact
 *    birth-instant → 節 span (lunar-javascript sect=2 conversion). startYear /
 *    startAge / endYear / isCurrent keep the engine's exact formulas
 *    (startYear = 起運 year + 10(i−1); startAge = startYear − civil birth year + 1;
 *    isCurrent compares 'asOf 00:00:00' with the 起運 timestamp strings).
 * 4. `liuNian` = 立春-based solar year of asOf (read at 00:00 Asia/Taipei like
 *    v3): `{ year: solar year, ganZhi }`. v3 reported the Gregorian asOf year
 *    with the solar-year 干支, e.g. asOf 2027-01-15 → `{ 2027, 丙午 }`; v4 gives
 *    `{ 2026, 丙午 }` (丙午 is the 2026 solar year until 立春 2027).
 * With `useTrueSolarTime: false`, a UTC+8 (Asia/Taipei, non-DST) birth that is
 * not within the 節 minute and asOf outside Jan 1 – 立春, all components are
 * identical to the v3 engine (tested).
 *
 * ## 紫微 (`TimeContextZiweiEngine`)
 * Exactly the V1-05 ziwei calculator path: `timeIndexFrom(ctx)` resolves
 * (solar date, iztro timeIndex) on true solar / civil time with the 子時
 * convention — 23:00–24:00 → 晚子 (timeIndex 12, same date) by default, which
 * the legacy `BirthData.timeIndex` getter could not express (it gave 早子 of the
 * same date) — and the engine runs on `ResolvedBirthData`.
 *
 * Unknown birth time: both fall back to the engine's own "not computed" result.
 *
 * @module core/timeContextEngines
 */

import { BirthData } from './models/BirthData';
import { BaZiEngine, TAIPEI_CONVENTION, ELEMENTS_LIMITATION, buildBaziNatalComponents } from '../engines/BaZiEngine';
import { ZiweiEngine } from '../engines/ZiweiEngine';
import { computePillars, luckCycles, solarYearOfAsOf, yearGanZhi, type ZiHourConvention } from '../calculators/bazi/pillars';
import { ResolvedBirthData } from '../calculators/ziwei/calculator';
import { timeIndexFrom } from '../calculators/ziwei/astrolabe';
import type { TimeContext } from '../time/types';
import { toZiweiZiConvention } from './analyzeInput';

/** `elements.limitation` when day/hour pillars ARE on true solar time. */
export const ELEMENTS_LIMITATION_TRUE_SOLAR = '此為五行出現次數，不代表旺衰、月令或藏干權重。';

const NAIVE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

type Pillars = { year: string; month: string; day: string; time: string };

interface TcOptions {
  ctx: TimeContext;
  useTrueSolarTime: boolean;
  ziHourConvention: ZiHourConvention;
}

export class TimeContextBaZiEngine extends BaZiEngine {
  #opts: TcOptions;

  constructor({ asOf, ...opts }: TcOptions & { asOf: string }) {
    super({ asOf });
    this.#opts = opts;
  }

  _compute(birth: BirthData) {
    const { ctx, useTrueSolarTime, ziHourConvention } = this.#opts;
    if (ctx.utc === null || ctx.local === null || birth.timeKnown === false) return super._compute(birth);

    const cfg = { useTrueSolarTime, ziHourConvention };
    const pr = computePillars(ctx, cfg);

    // 1. Engine on the resolved wall clock (true solar / civil).
    const m = NAIVE.exec(pr.clock.iso);
    if (!m) throw new Error(`Unexpected wall clock: ${pr.clock.iso}`);
    const [year, month, day, hour, minute] = m.slice(1, 6).map(Number);
    const wallBirth = new BirthData({ ...birth.toJSON(), year, month, day, hour, minute });
    const result = super._compute(wallBirth);

    // 2. Natal components from the exact pillars.
    const engineNatal = result.components.find((c: { id: string }) => c.id === 'natal')?.value as Pillars;
    const pillars: Pillars = { year: pr.pillars.year, month: pr.pillars.month, day: pr.pillars.day, time: pr.pillars.hour };
    const overriddenFields = (['year', 'month', 'day', 'time'] as const).filter((k) => engineNatal[k] !== pillars[k]);
    const convention = {
      ...TAIPEI_CONVENTION,
      timezone: ctx.profile.birthplace.timezone,
      dayBoundary: `lunar-javascript sect=${pr.conventions.sect}`,
      trueSolarTime: useTrueSolarTime,
    };
    const natal = buildBaziNatalComponents(pillars, {
      convention,
      elementsLimitation: useTrueSolarTime ? ELEMENTS_LIMITATION_TRUE_SOLAR : ELEMENTS_LIMITATION,
    });
    const natalById = new Map(natal.map((c: { id: string }) => [c.id, c]));

    // 3. 大運 from the exact birth instant.
    const luck = luckCycles(ctx, ctx.profile.gender, cfg);
    const startSolarStr = luck.startIso.replace('T', ' ');
    const startYear0 = Number(startSolarStr.slice(0, 4));
    const birthYear = Number(ctx.local.iso.slice(0, 4));
    const asOfCompareStr = `${this.asOf} 00:00:00`;

    // 4. 流年 by 立春 solar year.
    const liuNianYear = solarYearOfAsOf(this.asOf as string);

    for (const c of result.components) {
      const replacement = natalById.get(c.id) as unknown as { value: unknown; meta?: unknown } | undefined;
      if (replacement) {
        c.value = replacement.value;
        if (replacement.meta) c.meta = replacement.meta;
      } else if (c.category === 'daYun') {
        const i: number = c.value.index;
        const startYear = startYear0 + (i - 1) * 10;
        const stepStart = `${startYear}${startSolarStr.substring(4)}`;
        const stepEnd = `${startYear0 + i * 10}${startSolarStr.substring(4)}`;
        c.value = {
          index: i,
          ganZhi: luck.steps[i - 1].ganZhi,
          startYear,
          endYear: startYear + 9,
          startAge: startYear - birthYear + 1,
          isCurrent: asOfCompareStr >= stepStart && asOfCompareStr < stepEnd,
          ageConvention: 'nominal-year-age',
        };
      } else if (c.category === 'liuNian') {
        c.value = { year: liuNianYear, ganZhi: yearGanZhi(liuNianYear) };
      }
    }

    result.meta = {
      ...result.meta,
      dayBoundary: `eight-char sect=${pr.conventions.sect}`,
      yunCalculation: 'exact birth instant → 節 instant, lunar-javascript getYun sect=2 conversion',
      timeConvention: {
        clock: pr.clock,
        useTrueSolarTime,
        ziHourConvention,
        yearMonthBasis: 'jie-instant',
        solarYear: pr.solarYear,
        monthJie: pr.monthJie,
        liuNianYearBasis: 'liChun-solar-year',
        engineWallClockPillars: { year: engineNatal.year, month: engineNatal.month, day: engineNatal.day, time: engineNatal.time },
        overriddenFields,
        alternatives: pr.alternatives,
        luckStart: { direction: luck.direction, date: luck.startDate, age: luck.startAge, jie: luck.jie },
      },
    };
    return result;
  }
}

export class TimeContextZiweiEngine extends ZiweiEngine {
  #opts: TcOptions;

  constructor({ asOf, ...opts }: TcOptions & { asOf: Date }) {
    super({ asOf });
    this.#opts = opts;
  }

  _compute(birth: BirthData) {
    const { ctx, useTrueSolarTime, ziHourConvention } = this.#opts;
    const time = timeIndexFrom(ctx, { useTrueSolarTime, ziHourConvention: toZiweiZiConvention(ziHourConvention) });
    if (time === null || birth.timeKnown === false) return super._compute(birth);
    const { alternatives, ...primary } = time;
    const result = super._compute(new ResolvedBirthData(birth, primary));
    result.meta = {
      ...result.meta,
      timeConvention: {
        useTrueSolarTime,
        ziHourConvention: primary.ziHourConvention,
        basis: primary.basis,
        wallTime: primary.wallTime,
        iztroDate: primary.date,
        timeIndex: primary.timeIndex,
        alternatives,
      },
    };
    return result;
  }
}
