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
 * @typedef {import('./LayerClassifier.js').LayerCode} LayerCode
 */

/**
 * 定性斷言模式：在 `layers` 所列分層中出現即違規。
 *
 * @typedef {Object} QualitativePattern
 * @property {string} id          - 模式識別碼（穩定，供測試與擴充引用）
 * @property {RegExp} pattern     - 比對規則（不帶 g flag，無狀態）
 * @property {LayerCode[]} layers - 適用（＝禁止出現）的分層
 * @property {string} problem     - 違規說明模板；`{layer}` 會被實際分層代入
 */

/**
 * Violation — honesty.violations 元素（ARCHITECTURE.md §4.2，四欄不可增減）。
 *
 * @typedef {Object} Violation
 * @property {LayerCode} layer - 違規文字所屬分層
 * @property {string} location - 出處（如 'stateTable.scenarios[2].cells[0]'）
 * @property {string} text     - 違規原文
 * @property {string} problem  - 例如 'L2 內容使用了「你是」定性語氣'
 */

/**
 * @typedef {Object} LintResult
 * @property {boolean} ok        - true = 無違規
 * @property {string[]} problems - 每個命中模式一則說明
 */

// ─── Pattern Registry ───────────────────────────────────────────────────────

/** 時間與情境層（禁止定性斷言的分層）。 */
const TEMPORAL_LAYERS = /** @type {LayerCode[]} */ (['L1', 'L2', 'L3']);

/**
 * 定性斷言模式表（可擴充：push 新項即可，`lint`/`auditReport` 都會讀取）。
 * L0 為恆定結構層，「你是」屬合法語氣，故所有模式僅適用 L1/L2/L3。
 *
 * @type {QualitativePattern[]}
 */
export const QUALITATIVE_PATTERNS = [
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
   * @param {string} text - 待檢文字（非字串或空字串視為無違規）
   * @param {LayerCode} layerCode - 文字所屬分層
   * @returns {LintResult}
   */
  static lint(text, layerCode) {
    /** @type {string[]} */
    const problems = [];
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
   * 稽核整份 Report 中 D2/D4 填入的產文欄位。
   * 空殼 Report（scenarios/periods 為空、narrative 為空字串）回傳 `[]`。
   *
   * 掃描範圍與各自分層：
   *   - `stateTable.scenarios[].cells[].expression` → L3（情境語氣）
   *   - `evolution.periods[].summary`（兩行摘要，逐行檢查）→ L1
   *   - `evolution.narrative` → L1
   *
   * @param {Object} report - `analyze()` 產出的 Report（或同形狀物件）
   * @returns {Violation[]}
   */
  static auditReport(report) {
    /** @type {Violation[]} */
    const violations = [];
    if (!report || typeof report !== 'object') return violations;

    /**
     * @param {string} text
     * @param {LayerCode} layer
     * @param {string} location
     */
    const check = (text, layer, location) => {
      const { ok, problems } = HonestyGuard.lint(text, layer);
      if (ok) return;
      for (const problem of problems) {
        violations.push({ layer, location, text, problem });
      }
    };

    const scenarios = report.stateTable?.scenarios ?? [];
    scenarios.forEach((scenario, si) => {
      (scenario?.cells ?? []).forEach((cell, ci) => {
        check(cell?.expression, 'L3', `stateTable.scenarios[${si}].cells[${ci}]`);
      });
    });

    const periods = report.evolution?.periods ?? [];
    periods.forEach((period, pi) => {
      const summary = period?.summary;
      const lines = Array.isArray(summary) ? summary : summary != null ? [summary] : [];
      lines.forEach((line, li) => {
        check(line, 'L1', `evolution.periods[${pi}].summary[${li}]`);
      });
    });

    check(report.evolution?.narrative, 'L1', 'evolution.narrative');

    return violations;
  }
}
