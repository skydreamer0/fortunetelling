/**
 * get_chart 的 `conventions` 區塊：每次排盤回報「這張盤採用的口徑」。
 *
 * 來源原則（不憑空編）：
 *   1. 能從 core 實際回傳的 chart 讀到的（八字 chart.conventions、紫微 chart.time、吠陀 chart.settings、
 *      人類圖 chart.node），一律讀 chart，不寫死；
 *   2. chart 沒帶、但 core 以固定常數／檔頭文件寫明的，照 core 原始碼寫，並在 `source` 標出檔案；
 *   3. 兩者都查不到的，寫「未明確記錄」，不猜。
 * 這些口徑沿用 MCP 的既有 core 預設政策；Timeline 明傳真太陽時／晚子，其他 calculator 仍用原預設。
 */

import type { TimeContext } from '@fortune/core';

export const NOT_RECORDED = '未明確記錄';

export type Conventions = {
  /** 逐項口徑：鍵＝項目、值＝這次採用的設定（中文說明）。 */
  items: Record<string, string>;
  /** 對應的 core 原始碼（相對 packages/core/src），方便核對。 */
  source: string[];
  /** 查不到明確紀錄的項目（不猜）。 */
  notRecorded: string[];
};

const bool = (b: unknown) => (b === true ? '開（預設）' : b === false ? '關（使用當地民用時間）' : NOT_RECORDED);

/** 所有系統共用：時間處理（真太陽時＝當地平太陽時＋均時差；時區用 IANA 時區資料庫）。 */
function commonItems(ctx: Pick<TimeContext, 'profile'>): Record<string, string> {
  return {
    timezone: ctx.profile.birthplace?.timezone ? `出生地 IANA 時區 ${ctx.profile.birthplace.timezone}（含歷史夏令時間）` : NOT_RECORDED,
    trueSolarTime: '真太陽時 = 當地平太陽時（經度×4 分鐘）＋均時差（time/createTimeContext.ts）',
  };
}

type Chart = Record<string, any> | null | undefined;

export function conventionsFor(system: string, chart: Chart, ctx: Pick<TimeContext, 'profile'>): Conventions {
  const common = commonItems(ctx);
  switch (system) {
    case 'bazi': {
      const c = chart?.conventions as { useTrueSolarTime?: boolean; ziHourConvention?: string; clock?: { basis?: string }; yearMonthBasis?: string } | undefined;
      const zi = c?.ziHourConvention === 'late' ? '晚子時（子正換日，00:00 換日，23:00 仍屬當日；lunar-javascript sect=2）' : c?.ziHourConvention === 'early' ? '早子時（子初換日，23:00 起算隔日；sect=1）' : NOT_RECORDED;
      return {
        items: {
          ...common,
          useTrueSolarTime: `日柱與時柱用真太陽時：${bool(c?.useTrueSolarTime)}`,
          dayHourClock: c?.clock?.basis === 'trueSolar' ? '真太陽時' : c?.clock?.basis === 'civil' ? '當地民用時間' : NOT_RECORDED,
          ziHourConvention: zi,
          yearMonthBoundary: c?.yearMonthBasis === 'jie-instant' ? '年柱以立春、月柱以各「節」的精確時刻（UTC）換柱，不是整日或農曆月' : NOT_RECORDED,
          solarTerms: '節氣時刻來自 lunar-javascript（壽星天文曆，精度約 1 分鐘）',
          luckCycleStart: '大運：陽年男／陰年女順行，反之逆行；起運以出生到下一個（或上一個）節的時間換算，3 日 = 1 年',
        },
        source: ['calculators/bazi/pillars.ts', 'calculators/bazi/calculator.ts', 'time/solarTerms.ts'],
        notRecorded: [],
      };
    }
    case 'ziwei': {
      const t = chart?.time as { basis?: string; ziHourConvention?: string } | null | undefined;
      const zi =
        t?.ziHourConvention === 'splitMidnight'
          ? '分早晚子（23:00–24:00 為晚子時，仍用當日，iztro timeIndex 12；00:00–01:00 為早子時）'
          : t?.ziHourConvention === 'nextDayAt23'
            ? '子初換日（23:00 起算隔日）'
            : NOT_RECORDED;
      return {
        items: {
          ...common,
          clock: t?.basis === 'trueSolar' ? '真太陽時（預設）' : t?.basis === 'civil' ? '當地民用時間' : NOT_RECORDED,
          ziHourConvention: zi,
          yearBoundary: '年與運限以正月初一（春節）分界；虛歲逐年 +1（iztro 預設，core 不改全域設定）',
          leapMonth: '閏月以 iztro fixLeap=true 處理：閏月初一至十五併入前一月、十六起算次月（流月區間同此規則）',
          engine: 'iztro（語系 zh-TW）；大限／流年／流月區間由 core 依農曆春節與月初換算',
        },
        source: ['calculators/ziwei/astrolabe.ts', 'calculators/ziwei/types.ts', 'calculators/ziwei/calculator.ts'],
        notRecorded: [],
      };
    }
    case 'jyotish': {
      const s = chart?.settings as { ayanamsa?: string; node?: string; dashaYearDays?: number; houseSystem?: string } | undefined;
      return {
        items: {
          zodiac: s?.ayanamsa ? `恆星黃道，歲差 ${s.ayanamsa === 'lahiri' ? 'Lahiri（Chitrapaksha）' : s.ayanamsa}（採含章動的真值）` : NOT_RECORDED,
          node: s?.node === 'mean' ? '羅睺／計都用平交點（mean node）；計都 = 羅睺 + 180°' : s?.node === 'true' ? '羅睺／計都用真交點（true node）' : NOT_RECORDED,
          houseSystem: s?.houseSystem === 'whole_sign' ? '整宮制（Whole Sign，第 1 宮 = 上升星座）' : NOT_RECORDED,
          vimshottariYear: typeof s?.dashaYearDays === 'number' ? `Vimshottari 大運一年 = ${s.dashaYearDays} 日（儒略年）` : NOT_RECORDED,
          ephemeris: 'Swiss Ephemeris（WASM）的 Moshier 解析星曆，不含 .se1 檔',
          divisionalCharts: 'D1／D9／D10（BPHS 第 6 章）',
          dignity: '依 BPHS 第 3 章；友敵宮位的尊貴度未建模',
          ...common,
        },
        source: ['calculators/jyotish/jyotish.ts', 'calculators/jyotish/calculator.ts', 'calculators/astro/ephemeris.ts'],
        notRecorded: [],
      };
    }
    case 'humanDesign': {
      const node = chart?.node as string | undefined;
      return {
        items: {
          node: node === 'true' ? '南北交點用真交點（true node）' : node === 'mean' ? '南北交點用平交點（mean node）' : NOT_RECORDED,
          designMoment: '設計盤取「太陽黃經比出生時少 88°」的時刻（約出生前 88–89 天，數值求解）',
          positions: '熱帶（回歸）黃道、視地心黃經，Swiss Ephemeris',
          ephemeris: 'Moshier 解析星曆（警示碼 ephemeris:moshier_fallback）',
          crossNames: '輪迴交叉的名稱未查表（core 沒有已驗證的名稱表）',
          ...common,
        },
        source: ['calculators/humanDesign/humanDesign.ts', 'calculators/humanDesign/calculator.ts', 'calculators/astro/sunLongitudeSolve.ts'],
        notRecorded: [],
      };
    }
    case 'numerology':
      return {
        items: {
          lifePath: '年、月、日各自化簡後相加，再化簡一次；保留 11／22／33 不再化簡（與 NumerologyEngine 相同）',
          personalYear: '個人流年 = 化簡( 化簡(月) + 化簡(日) + 化簡(西曆年) )，保留大師數；以西曆年計，不以立春或生日換年',
          pinnaclesAndChallenges: '標準 Pythagorean 算法',
          nameNumbers: `姓名類數字（表現數、靈魂渴望數、人格數）的字母對照表：${NOT_RECORDED}`,
          date: '使用出生地民用日期（不用真太陽時換日）',
        },
        source: ['calculators/numerology/numerology.ts', 'calculators/numerology/calculator.ts'],
        notRecorded: ['nameNumbers.letterTable'],
      };
    case 'tzolkin':
      return {
        items: {
          calendar: 'Dreamspell（Argüelles）13 月亮曆，Kin 1–260',
          epoch: '1987-07-26 = Kin 34；西曆閏日 2/29 為「0.0 Hunab Ku」，不推進計數、與 2/28 同 Kin',
          oracle: 'Fifth Force Oracle（Argüelles《Dreamspell》1990）：analog／antipode／occult／guide 公式見檔頭',
          mayanTraditionalCount: `與傳統瑪雅長紀曆（Long Count）的對應：${NOT_RECORDED}`,
        },
        source: ['calculators/tzolkin/tzolkin.ts'],
        notRecorded: ['mayanTraditionalCount'],
      };
    case 'mingGua':
      return {
        items: {
          yearBoundary: '以立春精確時刻（太陽黃經 315°）換年，不是 1/1 也不是固定 2/4（liChun-exact）',
          formula: '千禧年校正：西曆（立春）年尾兩位數字根 d；2000 年前 男 10−d、女 d+5；2000 年起 男 9−d、女 d+6；超過 9 減 9，0 當 9',
          centralFive: '得 5（中宮）時：男歸 2（坤）、女歸 8（艮）',
          ...common,
        },
        source: ['calculators/mingGua/mingGua.ts'],
        notRecorded: [],
      };
    default:
      return { items: { ...common }, source: [], notRecorded: [system] };
  }
}
