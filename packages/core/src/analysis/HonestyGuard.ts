import type { LayerCode } from './LayerClassifier';
/**
 * @fileoverview HonestyGuard（區塊 H④）— 動靜誠實的語言守門員。
 *
 * 依 L0–L3 分層語言規則檢查產出文字：
 *   L0 恆定結構層 允許最強斷言（「你是…」）；
 *   L1/L2/L3 時間與情境層禁止定性斷言（「你是」「你天生」「注定」「永遠」等），
 *   只能用「這段時期你會偏向…」「在某情境下你會…」等弱斷言語氣。
 *
 * 兩個入口：
 *   - `HonestyGuard.lint(text, layerCode)`：單段文字檢查，供 StateSwitchTable（D2）
 *     與 EvolutionCalculator（D4）在產文當下自檢。
 *   - `HonestyGuard.auditReport(report)`：整份 Report 稽核，掃描
 *     `stateTable.scenarios[].cells[].expression`、`evolution.periods[].summary`、
 *     `evolution.narrative`，產出 `Violation[]`（形狀見 ARCHITECTURE.md §4.2）。
 *
 * 純函數、無依賴（analysis 層不得 import engines 或命理函式庫，D-016）。
 *
 * @module analysis/HonestyGuard
 */

// ─── Type Definitions ───────────────────────────────────────────────────────

/**
 * 定性斷言模式：在 `layers` 所列分層中出現即違規。
 */
export interface QualitativePattern {
  /** 模式識別碼（穩定，供測試與擴充引用） */
  id: string;
  /** 比對規則（不帶 g flag，無狀態） */
  pattern: RegExp;
  /** 適用（＝禁止出現）的分層 */
  layers: LayerCode[];
  /** 違規說明模板；`{layer}` 會被實際分層代入 */
  problem: string;
}

/**
 * Violation — honesty.violations 元素（ARCHITECTURE.md §4.2，四欄不可增減）。
 */
export interface Violation {
  /** 違規文字所屬分層 */
  layer: LayerCode;
  /** 出處（如 'stateTable.scenarios[2].cells[0]'） */
  location: string;
  /** 違規原文 */
  text: string;
  /** 例如 'L2 內容使用了「你是」定性語氣' */
  problem: string;
}

export interface LintResult {
  /** true = 無違規 */
  ok: boolean;
  /** 每個命中模式一則說明 */
  problems: string[];
}

// ─── Pattern Registry ───────────────────────────────────────────────────────

/** 時間與情境層（禁止定性斷言的分層）。 */
const TEMPORAL_LAYERS: LayerCode[] = ['L1', 'L2', 'L3'];

/**
 * 定性斷言模式表（可擴充：push 新項即可，`lint`/`auditReport` 都會讀取）。
 * L0 為恆定結構層，「你是」屬合法語氣，故所有模式僅適用 L1/L2/L3。
 */
export const QUALITATIVE_PATTERNS: QualitativePattern[] = [
  {
    id: 'ni-shi',
    pattern: /你是/,
    layers: TEMPORAL_LAYERS,
    problem: '{layer} 內容使用了「你是」定性語氣',
  },
  {
    id: 'ni-tian-sheng',
    pattern: /你天生/,
    layers: TEMPORAL_LAYERS,
    problem: '{layer} 內容使用了「你天生」定性語氣',
  },
  {
    id: 'zhu-ding',
    pattern: /注定/,
    layers: TEMPORAL_LAYERS,
    problem: '{layer} 內容使用了「注定」宿命斷言',
  },
  {
    id: 'yong-yuan',
    pattern: /永遠/,
    layers: TEMPORAL_LAYERS,
    problem: '{layer} 內容使用了「永遠」絕對化語氣',
  },
  {
    id: 'jue-dui',
    pattern: /絕對/,
    layers: TEMPORAL_LAYERS,
    problem: '{layer} 內容使用了「絕對」絕對化語氣',
  },
  {
    id: 'yi-ding-hui',
    pattern: /一定會/,
    layers: TEMPORAL_LAYERS,
    problem: '{layer} 內容使用了「一定會」絕對化語氣',
  },
  {
    id: 'cong-bu',
    pattern: /從不/,
    layers: TEMPORAL_LAYERS,
    problem: '{layer} 內容使用了「從不」絕對化語氣',
  },
];

// ─── HonestyGuard ───────────────────────────────────────────────────────────

/**
 * 語言守門員。全部為靜態純函數，無內部狀態。
 */
export class HonestyGuard {
  /**
   * 檢查一段文字在指定分層下是否含定性斷言。
   *
   * @param text - 待檢文字（非字串或空字串視為無違規）
   * @param layerCode - 文字所屬分層
   */
  static lint(text: unknown, layerCode: LayerCode): LintResult {
    const problems: string[] = [];
    if (typeof text === 'string' && text.length > 0) {
      for (const { pattern, layers, problem } of QUALITATIVE_PATTERNS) {
        if (layers.includes(layerCode) && pattern.test(text)) {
          problems.push(problem.replace('{layer}', layerCode));
        }
      }
    }
    return { ok: problems.length === 0, problems };
  }

  /**
   * 稽核整份 Report 中狀態、演化與使用者問題視圖的產文欄位。
   * 空殼 Report（scenarios/periods 為空、narrative 為空字串）回傳 `[]`。
   *
   * 掃描範圍與各自分層：
   *   - `stateTable.scenarios[].cells[].expression` → L3（情境語氣）
   *   - `evolution.periods[].summary`（兩行摘要，逐行檢查）→ L1
   *   - `evolution.narrative` → L1
   *   - `insights.*` 敘事 → L1／L2／L3
   *   - v4：`signals[].evidence.text` 與 `modifiers[].reason` → 依 window.grain（natal L0、decade L1、year/month L2）
   *   - v4：`timeContext.flags[].detail` → L2
   *
   * @param report - `analyze()` 產出的 Report（或同形狀物件）
   */
  static auditReport(report: Record<string, any>): Violation[] {
    const violations: Violation[] = [];
    if (!report || typeof report !== 'object') return violations;

    const check = (text: any, layer: LayerCode, location: string) => {
      const { ok, problems } = HonestyGuard.lint(text, layer);
      if (ok) return;
      for (const problem of problems) {
        violations.push({ layer, location, text, problem });
      }
    };

    const scenarios = report.stateTable?.scenarios ?? [];
    scenarios.forEach((scenario: any, si: number) => {
      (scenario?.cells ?? []).forEach((cell: any, ci: number) => {
        check(cell?.expression, 'L3', `stateTable.scenarios[${si}].cells[${ci}]`);
      });
    });

    const periods = report.evolution?.periods ?? [];
    periods.forEach((period: any, pi: number) => {
      const summary = period?.summary;
      const lines = Array.isArray(summary) ? summary : summary != null ? [summary] : [];
      lines.forEach((line: unknown, li: number) => {
        check(line, 'L1', `evolution.periods[${pi}].summary[${li}]`);
      });
    });

    check(report.evolution?.narrative, 'L1', 'evolution.narrative');

    (report.insights?.domains ?? []).forEach((domain: any, index: number) => {
      check(domain?.insight, 'L3', `insights.domains[${index}].insight`);
      check(domain?.stage, 'L1', `insights.domains[${index}].stage`);
    });
    (report.insights?.annual?.themes ?? []).forEach((theme: any, index: number) => {
      check(theme?.text, 'L2', `insights.annual.themes[${index}].text`);
    });
    check(report.insights?.guidance?.balance?.text, 'L3', 'insights.guidance.balance.text');

    // ── Report v4（D-032）：訊號證據文字與時間旗標說明 ──
    // 訊號依 window.grain 分層：natal→L0、decade→L1、year/month→L2。
    // timeline 各格的 topSignals 與 `signals` 是同一批物件（signals 為其去重聯集），
    // 另外逐格檢查只會重複回報，因此只稽核 `signals`。
    const SIGNAL_LAYER: Record<string, LayerCode> = { natal: 'L0', decade: 'L1', year: 'L2', month: 'L2' };
    (Array.isArray(report.signals) ? report.signals : []).forEach((signal: any, index: number) => {
      const layer = SIGNAL_LAYER[signal?.window?.grain] ?? 'L2';
      check(signal?.evidence?.text, layer, `signals[${index}].evidence.text`);
      (signal?.evidence?.modifiers ?? []).forEach((modifier: any, mi: number) => {
        check(modifier?.reason, layer, `signals[${index}].evidence.modifiers[${mi}].reason`);
      });
    });
    (report.timeContext?.flags ?? []).forEach((flag: any, index: number) => {
      check(flag?.detail, 'L2', `timeContext.flags[${index}].detail`);
    });

    return violations;
  }
}
