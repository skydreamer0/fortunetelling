/**
 * @fileoverview Transparent Scoring Rules Registry
 *
 * Stores every scoring formula as structured data so that each radar axis's
 * scoring method can be inspected, printed, and cross-compared between reports.
 *
 * This module is the transparency backbone of the analysis layer (Block G v2).
 *
 * @module analysis/ScoringRules
 */

// ─── Rule Schema ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ScoringRule
 * @property {string} id            - Unique rule identifier (e.g. "bazi_fire_strength")
 * @property {string} radarType     - Radar type this rule belongs to
 * @property {string} axisName      - Axis this rule scores
 * @property {string} sourceSystem  - Originating engine (e.g. "bazi", "ziwei", "vedic")
 * @property {string} formula       - Machine-readable formula expression
 * @property {string} description   - Human-readable explanation (Chinese)
 * @property {string[]} inputs      - List of input variable names
 * @property {number} maxValue      - Maximum possible score
 * @property {number} minValue      - Minimum possible score
 * @property {string} unit          - Score unit (e.g. "%" or "分")
 * @property {string} version       - Rule version for change tracking
 */

/**
 * @typedef {Object} FormattedRule
 * @property {string} title         - Rule title
 * @property {string} formulaText   - Human-readable formula
 * @property {string} description   - Explanation
 * @property {string} source        - Source system label
 * @property {string[]} inputLabels - Labelled inputs
 * @property {string} range         - Score range string
 */

// ─── Built-in Rule Definitions ──────────────────────────────────────────────

/**
 * Default scoring rules shipped with the platform.
 * Each entry is a complete, transparent specification.
 * @type {ScoringRule[]}
 */
const DEFAULT_RULES = [
  // ── BaZi Element Strength Radar ───────────────────────────────────────
  {
    id: 'bazi_wood_strength',
    radarType: 'element_balance',
    axisName: '木',
    sourceSystem: 'bazi',
    formula: '(woodCount / totalElements) * 100',
    description: '八字中木五行的數量佔所有五行總數的百分比。天干地支藏干均計入。',
    inputs: ['woodCount', 'totalElements'],
    maxValue: 100,
    minValue: 0,
    unit: '%',
    version: '1.0.0'
  },
  {
    id: 'bazi_fire_strength',
    radarType: 'element_balance',
    axisName: '火',
    sourceSystem: 'bazi',
    formula: '(fireCount / totalElements) * 100',
    description: '八字中火五行的數量佔所有五行總數的百分比。天干地支藏干均計入。',
    inputs: ['fireCount', 'totalElements'],
    maxValue: 100,
    minValue: 0,
    unit: '%',
    version: '1.0.0'
  },
  {
    id: 'bazi_earth_strength',
    radarType: 'element_balance',
    axisName: '土',
    sourceSystem: 'bazi',
    formula: '(earthCount / totalElements) * 100',
    description: '八字中土五行的數量佔所有五行總數的百分比。天干地支藏干均計入。',
    inputs: ['earthCount', 'totalElements'],
    maxValue: 100,
    minValue: 0,
    unit: '%',
    version: '1.0.0'
  },
  {
    id: 'bazi_metal_strength',
    radarType: 'element_balance',
    axisName: '金',
    sourceSystem: 'bazi',
    formula: '(metalCount / totalElements) * 100',
    description: '八字中金五行的數量佔所有五行總數的百分比。天干地支藏干均計入。',
    inputs: ['metalCount', 'totalElements'],
    maxValue: 100,
    minValue: 0,
    unit: '%',
    version: '1.0.0'
  },
  {
    id: 'bazi_water_strength',
    radarType: 'element_balance',
    axisName: '水',
    sourceSystem: 'bazi',
    formula: '(waterCount / totalElements) * 100',
    description: '八字中水五行的數量佔所有五行總數的百分比。天干地支藏干均計入。',
    inputs: ['waterCount', 'totalElements'],
    maxValue: 100,
    minValue: 0,
    unit: '%',
    version: '1.0.0'
  },

  // ── ZiWei Star Brightness Radar ───────────────────────────────────────
  {
    id: 'ziwei_star_brightness',
    radarType: 'star_brightness',
    axisName: '主星亮度',
    sourceSystem: 'ziwei',
    // 與 ZiweiEngine.BRIGHTNESS_WEIGHTS 共用同一套七級制，兩處不得分岔
    formula: '(BRIGHTNESS_WEIGHTS[brightness] / 7) * 100 where 廟=7, 旺=6, 得=5, 利=4, 平=3, 不=2, 陷=1',
    description: '紫微斗數主星在該宮位的廟旺利得平不陷（七級）狀態，除以最高權重 7 轉換為百分比。廟為最亮（100%），陷為最暗（約 14%）。權重表與 ZiweiEngine.BRIGHTNESS_WEIGHTS 同源。',
    inputs: ['starName', 'brightness'],
    maxValue: 100,
    minValue: 14,
    unit: '%',
    version: '1.1.0'
  },
  {
    id: 'ziwei_palace_strength',
    radarType: 'palace_strength',
    axisName: '宮位力量',
    sourceSystem: 'ziwei',
    formula: '(mainStarBrightness * 0.6) + (min(auxiliaryStarCount * 10, 100) * 0.2) + (fourTransformBonus * 0.2)',
    description: '宮位綜合力量 = 主星亮度(60%) + 輔星數量加成(20%) + 四化加成(20%)。主星亮度取宮內主星最高亮度分數×100（0–100，無主星計 0）；輔星數量加成 = 輔星數×10（上限 100）；四化加成 = 宮內含生年四化星（祿權科忌）為 100，否則為 0。',
    inputs: ['mainStarBrightness', 'auxiliaryStarCount', 'fourTransformBonus'],
    maxValue: 100,
    minValue: 0,
    unit: '分',
    version: '1.1.0'
  },

  // ── Vedic Dignity Radar ───────────────────────────────────────────────
  {
    id: 'vedic_planet_dignity',
    radarType: 'planetary_dignity',
    axisName: '行星尊貴度',
    sourceSystem: 'vedic',
    formula: 'dignityMap[status] where exalted=100, moolatrikona=85, own=70, friendly=55, neutral=40, enemy=25, debilitated=10',
    description: '吠陀占星中行星在星座的尊貴狀態。高位（100）到落陷（10）。',
    inputs: ['planetName', 'dignityStatus'],
    maxValue: 100,
    minValue: 10,
    unit: '分',
    version: '1.0.0'
  },
  {
    id: 'vedic_d1_vs_d9',
    radarType: 'divisional_comparison',
    axisName: 'D1/D9 對比',
    sourceSystem: 'vedic',
    formula: 'abs(d1Dignity - d9Dignity)',
    description: '本命盤（D1）與九分盤（D9）中同一行星尊貴度的差異。差異越大表示內外表現落差越大。',
    inputs: ['d1Dignity', 'd9Dignity'],
    maxValue: 90,
    minValue: 0,
    unit: '分',
    version: '1.0.0'
  },

  // ── Numerology Frequency Radar ────────────────────────────────────────
  {
    id: 'numerology_digit_frequency',
    radarType: 'digit_frequency',
    axisName: '數字頻次',
    sourceSystem: 'numerology',
    formula: 'digitOccurrences',
    description: '生命靈數九宮格中某數字（1–9）於出生日期 yyyymmdd 八位數中的出現次數。0 不計入；單位為次數而非百分比（D-011）。',
    inputs: ['digitOccurrences'],
    maxValue: 8,
    minValue: 0,
    unit: '次',
    version: '2.0.0'
  },

  // ── Human Design Centers Radar ────────────────────────────────────────
  {
    id: 'hd_center_definition',
    radarType: 'center_definition',
    axisName: '能量中心定義',
    sourceSystem: 'humandesign',
    formula: 'defined ? 100 : 0',
    description: '人類圖能量中心是否被定義。有定義 = 100（固定能量），無定義 = 0（開放/接收能量）。',
    inputs: ['centerName', 'defined'],
    maxValue: 100,
    minValue: 0,
    unit: '%',
    version: '1.0.0'
  }

  // 註：原「Cross-System Personality Radar」的 5 條 personality_composite
  // 規則已依 D-009 於任務 C1 移除——它們依賴永不存在的 vedic/humandesign
  // 輸入（死規則），且違反「每系統一張、不做跨系統合併雷達」的決策。
];

// ─── Formatting Helpers ─────────────────────────────────────────────────────

/**
 * Source system display names (Chinese).
 * @type {Record<string, string>}
 */
const SOURCE_LABELS = {
  bazi: '八字',
  ziwei: '紫微斗數',
  vedic: '吠陀占星',
  numerology: '生命靈數',
  humandesign: '人類圖'
};

/**
 * Radar type display names (Chinese).
 * @type {Record<string, string>}
 */
const RADAR_TYPE_LABELS = {
  element_balance: '五行平衡雷達',
  star_brightness: '主星亮度雷達',
  palace_strength: '宮位力量雷達',
  planetary_dignity: '行星尊貴度雷達',
  divisional_comparison: '分盤比較雷達',
  digit_frequency: '數字頻次長條',
  center_definition: '能量中心定義雷達'
};

// ─── ScoringRules Class ─────────────────────────────────────────────────────

/**
 * Manages transparent, inspectable scoring rules for every radar axis.
 *
 * Every score shown in the UI has a corresponding ScoringRule that can be
 * printed, compared, and audited. This is the Block G v2 transparency
 * requirement.
 */
export class ScoringRules {
  /** @type {Map<string, ScoringRule>} */
  #rulesById;

  /** @type {Map<string, ScoringRule[]>} */
  #rulesByRadar;

  /** @type {Map<string, ScoringRule[]>} */
  #rulesBySystem;

  constructor() {
    this.#rulesById = new Map();
    this.#rulesByRadar = new Map();
    this.#rulesBySystem = new Map();
    this.#loadDefaults();
  }

  /**
   * Load the built-in default rules into the registry.
   */
  #loadDefaults() {
    for (const rule of DEFAULT_RULES) {
      this.addRule(rule);
    }
  }

  /**
   * Register a new scoring rule.
   *
   * @param {ScoringRule} rule - The rule to register
   * @throws {Error} If a rule with the same id already exists
   */
  addRule(rule) {
    this.#validateRule(rule);

    if (this.#rulesById.has(rule.id)) {
      throw new Error(`Scoring rule "${rule.id}" is already registered.`);
    }

    this.#rulesById.set(rule.id, { ...rule });

    if (!this.#rulesByRadar.has(rule.radarType)) {
      this.#rulesByRadar.set(rule.radarType, []);
    }
    this.#rulesByRadar.get(rule.radarType).push(rule);

    if (!this.#rulesBySystem.has(rule.sourceSystem)) {
      this.#rulesBySystem.set(rule.sourceSystem, []);
    }
    this.#rulesBySystem.get(rule.sourceSystem).push(rule);
  }

  /**
   * Validate that a rule has all required fields.
   *
   * @param {ScoringRule} rule
   * @throws {Error} If validation fails
   */
  #validateRule(rule) {
    const required = [
      'id', 'radarType', 'axisName', 'sourceSystem',
      'formula', 'description', 'inputs', 'maxValue', 'minValue', 'unit', 'version'
    ];
    for (const field of required) {
      if (rule[field] === undefined || rule[field] === null) {
        throw new Error(`Scoring rule missing required field: "${field}"`);
      }
    }
    if (!Array.isArray(rule.inputs) || rule.inputs.length === 0) {
      throw new Error(`Scoring rule "${rule.id}" must have at least one input.`);
    }
    if (rule.maxValue < rule.minValue) {
      throw new Error(`Scoring rule "${rule.id}": maxValue must be >= minValue.`);
    }
  }

  /**
   * Retrieve a rule by its unique ID.
   *
   * @param {string} ruleId
   * @returns {ScoringRule|null}
   */
  getRule(ruleId) {
    return this.#rulesById.get(ruleId) ?? null;
  }

  /**
   * Get all scoring rules that belong to a specific radar type.
   *
   * @param {string} radarType - e.g. "element_balance", "planetary_dignity"
   * @returns {ScoringRule[]}
   */
  getRulesForRadar(radarType) {
    return [...(this.#rulesByRadar.get(radarType) ?? [])];
  }

  /**
   * Get all scoring rules originating from a specific engine/system.
   *
   * @param {string} sourceSystem - e.g. "bazi", "vedic"
   * @returns {ScoringRule[]}
   */
  getRulesForSystem(sourceSystem) {
    return [...(this.#rulesBySystem.get(sourceSystem) ?? [])];
  }

  /**
   * Format a single rule into a human-readable description object.
   *
   * @param {ScoringRule} rule
   * @returns {FormattedRule}
   */
  formatRule(rule) {
    const sourceLabel = SOURCE_LABELS[rule.sourceSystem] ?? rule.sourceSystem;
    return {
      title: `【${sourceLabel}】${rule.axisName}`,
      formulaText: `公式：${rule.formula}`,
      description: rule.description,
      source: sourceLabel,
      inputLabels: rule.inputs.map(input => `  · ${input}`),
      range: `範圍：${rule.minValue}${rule.unit} – ${rule.maxValue}${rule.unit}`
    };
  }

  /**
   * Format a rule into a single printable string (for report embedding).
   *
   * @param {ScoringRule} rule
   * @returns {string}
   */
  formatRuleAsText(rule) {
    const formatted = this.formatRule(rule);
    const lines = [
      formatted.title,
      formatted.formulaText,
      formatted.range,
      `說明：${formatted.description}`,
      `輸入變量：`,
      ...formatted.inputLabels,
      `來源：${formatted.source}`,
      `版本：${rule.version}`
    ];
    return lines.join('\n');
  }

  /**
   * Export all registered rules as a structured snapshot for cross-report
   * comparison or audit trail.
   *
   * @returns {{ exportedAt: string, totalRules: number, byRadarType: Record<string, ScoringRule[]>, bySystem: Record<string, ScoringRule[]> }}
   */
  exportRules() {
    /** @type {Record<string, ScoringRule[]>} */
    const byRadarType = {};
    for (const [type, rules] of this.#rulesByRadar) {
      byRadarType[type] = rules.map(r => ({ ...r }));
    }

    /** @type {Record<string, ScoringRule[]>} */
    const bySystem = {};
    for (const [system, rules] of this.#rulesBySystem) {
      bySystem[system] = rules.map(r => ({ ...r }));
    }

    return {
      exportedAt: new Date().toISOString(),
      totalRules: this.#rulesById.size,
      byRadarType,
      bySystem
    };
  }

  /**
   * Get the display label for a radar type.
   *
   * @param {string} radarType
   * @returns {string}
   */
  getRadarTypeLabel(radarType) {
    return RADAR_TYPE_LABELS[radarType] ?? radarType;
  }

  /**
   * Get the display label for a source system.
   *
   * @param {string} sourceSystem
   * @returns {string}
   */
  getSourceLabel(sourceSystem) {
    return SOURCE_LABELS[sourceSystem] ?? sourceSystem;
  }

  /**
   * List all registered radar types.
   *
   * @returns {string[]}
   */
  getRadarTypes() {
    return [...this.#rulesByRadar.keys()];
  }

  /**
   * Generate a full transparency report: every rule, formatted, grouped by
   * radar type. Suitable for appending to any fortune-telling report.
   *
   * @returns {string}
   */
  generateTransparencyReport() {
    const sections = [];
    sections.push('═══════════════════════════════════════════');
    sections.push('  評分規則透明度報告  Scoring Rules Report');
    sections.push('═══════════════════════════════════════════');
    sections.push('');

    for (const [radarType, rules] of this.#rulesByRadar) {
      const label = RADAR_TYPE_LABELS[radarType] ?? radarType;
      sections.push(`── ${label} ──────────────────────────────`);
      sections.push('');
      for (const rule of rules) {
        sections.push(this.formatRuleAsText(rule));
        sections.push('');
      }
    }

    sections.push(`總計：${this.#rulesById.size} 條規則`);
    sections.push(`匯出時間：${new Date().toISOString()}`);
    return sections.join('\n');
  }
}
