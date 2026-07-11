/**
 * @fileoverview Layer Classifier (L0–L3)
 *
 * Classifies every component produced by fortune-telling engines into one of
 * four temporal layers.  The classification drives language rules (HonestyGuard)
 * and evolution calculations.
 *
 * Layer definitions:
 *   L0 恆定結構層 – Permanent natal structures (never change)
 *   L1 慢變層     – Slow-moving periods (~10-20 year cycles)
 *   L2 年變層     – Annual / transit-level changes
 *   L3 情境切換層 – Context-dependent activations
 *
 * @module analysis/LayerClassifier
 */

// ─── Type Definitions ───────────────────────────────────────────────────────

/**
 * @typedef {'L0'|'L1'|'L2'|'L3'} LayerCode
 */

/**
 * @typedef {Object} LayerDefinition
 * @property {LayerCode} code
 * @property {string} name         - Chinese layer name
 * @property {string} englishName  - English layer name
 * @property {string} description  - What this layer represents
 * @property {string} timeScale    - Human-readable time scale
 * @property {string} languageRule - Required prefix per HonestyGuard
 */

/**
 * @typedef {Object} ClassifiedComponent
 * @property {string} id           - Component identifier
 * @property {string} name         - Display name
 * @property {LayerCode} layer     - Assigned layer
 * @property {string} sourceSystem - Originating engine
 * @property {string} category     - Sub-category within the engine
 * @property {*} value             - The component's value / data
 * @property {string} rationale    - Why it was classified into this layer
 * @property {boolean} [unclassified] - True when no rule matched and the layer
 *   is a conservative fallback, not a real classification
 */

/**
 * @typedef {Object} LayerClassification
 * @property {LayerDefinition[]} layerDefinitions - All four layer defs
 * @property {ClassifiedComponent[]} components   - All classified components
 * @property {Record<LayerCode, ClassifiedComponent[]>} byLayer - Grouped
 * @property {Record<string, ClassifiedComponent[]>} bySystem  - Grouped
 * @property {ClassifiedComponent[]} unclassified - Components no rule matched
 *   (assigned L3 as conservative fallback; add a rule to classify them properly)
 * @property {string} classifiedAt - ISO timestamp
 */

// ─── Layer Definitions ──────────────────────────────────────────────────────

/** @type {LayerDefinition[]} */
const LAYER_DEFINITIONS = [
  {
    code: 'L0',
    name: '恆定結構層',
    englishName: 'Permanent Structure',
    description: '出生時即確定、終生不變的結構。包含本命盤、人格類型、生命靈數等。這是你的「底色」。',
    timeScale: '終生不變',
    languageRule: '你是…'
  },
  {
    code: 'L1',
    name: '慢變層',
    englishName: 'Slow Change',
    description: '以十年為單位緩慢演變的週期。八字大運、紫微大限、吠陀大運（Mahadasha）等。像是人生的「章節」。',
    timeScale: '約10-20年一變',
    languageRule: '這段時期你會偏向…'
  },
  {
    code: 'L2',
    name: '年變層',
    englishName: 'Annual Change',
    description: '以年為單位變化的影響。流年飛星、年度行運、小限等。是年度的「天氣預報」。',
    timeScale: '每年變化',
    languageRule: '今年/這段時間你會…'
  },
  {
    code: 'L3',
    name: '情境切換層',
    englishName: 'Context Switch',
    description: '隨情境而切換的面向。上升星座 vs 太陽星座 vs 月亮星座、人類圖開放中心的制約。在不同場合會展現不同面向。',
    timeScale: '隨情境變化',
    languageRule: '在某情境下你會…'
  }
];

// ─── Classification Rules ───────────────────────────────────────────────────

/**
 * Classification rule: maps a source system + component category to a layer
 * and provides a rationale.
 *
 * @typedef {Object} ClassificationRule
 * @property {string} sourceSystem
 * @property {string} category        - Regex-compatible pattern
 * @property {LayerCode} layer
 * @property {string} rationale
 */

/** @type {ClassificationRule[]} */
const CLASSIFICATION_RULES = [
  // ── BaZi ────────────────────────────────────────────────────────────
  { sourceSystem: 'bazi', category: 'natal',           layer: 'L0', rationale: '八字命盤為出生時確定，終生不變。' },
  { sourceSystem: 'bazi', category: 'dayMaster',       layer: 'L0', rationale: '日主（日干）為命盤核心，終生不變。' },
  { sourceSystem: 'bazi', category: 'tenGods',         layer: 'L0', rationale: '十神格局為命盤結構，終生不變。' },
  { sourceSystem: 'bazi', category: 'elements',        layer: 'L0', rationale: '五行分佈為命盤結構，終生不變。' },
  { sourceSystem: 'bazi', category: 'tenGodsContext',  layer: 'L3', rationale: '十神作為關係角色（對財、對官、對印等）在不同對象前顯隱，屬情境切換面向；十神格局本身仍屬 L0（tenGods）。' },
  { sourceSystem: 'bazi', category: 'daYun',           layer: 'L1', rationale: '大運每十年一變，為慢變週期。' },
  { sourceSystem: 'bazi', category: 'liuNian',         layer: 'L2', rationale: '流年每年一變。' },
  { sourceSystem: 'bazi', category: 'liuYue',          layer: 'L2', rationale: '流月每月一變，歸入年變層。' },

  // ── ZiWei ───────────────────────────────────────────────────────────
  { sourceSystem: 'ziwei', category: 'natal',          layer: 'L0', rationale: '紫微命盤為出生時確定的星曜配置。' },
  { sourceSystem: 'ziwei', category: 'palaces',        layer: 'L0', rationale: '十二宮位結構終生不變。' },
  { sourceSystem: 'ziwei', category: 'mainStars',      layer: 'L0', rationale: '主星落宮終生不變。' },
  { sourceSystem: 'ziwei', category: 'fourTransforms',  layer: 'L0', rationale: '生年四化終生不變。' },
  { sourceSystem: 'ziwei', category: 'daXian',         layer: 'L1', rationale: '大限每十年一變，為慢變週期。' },
  { sourceSystem: 'ziwei', category: 'xiaoXian',       layer: 'L2', rationale: '小限每年一變。' },
  { sourceSystem: 'ziwei', category: 'flyingStars',    layer: 'L2', rationale: '流年飛星每年變化。' },
  { sourceSystem: 'ziwei', category: 'soulVsBody',     layer: 'L3', rationale: '命宮主先天格局、身宮主後天發展與情境反應，兩者對照為隨場合切換的面向。' },
  { sourceSystem: 'ziwei', category: 'sanFangSiZheng', layer: 'L3', rationale: '三方四正描述宮位在互動情境中被會照的組合，屬情境切換面向。' },

  // ── Vedic ───────────────────────────────────────────────────────────
  { sourceSystem: 'vedic', category: 'natal',          layer: 'L0', rationale: '吠陀本命盤（D1）終生不變。' },
  { sourceSystem: 'vedic', category: 'd9',             layer: 'L0', rationale: '九分盤（D9）終生不變。' },
  { sourceSystem: 'vedic', category: 'nakshatras',     layer: 'L0', rationale: '月亮星宿終生不變。' },
  { sourceSystem: 'vedic', category: 'mahadasha',      layer: 'L1', rationale: 'Mahadasha 大運週期約6-20年一變。' },
  { sourceSystem: 'vedic', category: 'antardasha',     layer: 'L2', rationale: 'Antardasha（中運）為大運子週期，以年為尺度變化，屬年變層。' },
  { sourceSystem: 'vedic', category: 'transits',       layer: 'L2', rationale: '行星行運持續變化，歸入年變層。' },

  // ── Numerology ──────────────────────────────────────────────────────
  { sourceSystem: 'numerology', category: 'lifePath',      layer: 'L0', rationale: '生命靈數由出生日期計算，終生不變。' },
  { sourceSystem: 'numerology', category: 'expression',    layer: 'L0', rationale: '表達數終生不變。' },
  { sourceSystem: 'numerology', category: 'soulUrge',      layer: 'L0', rationale: '靈魂衝動數終生不變。' },
  { sourceSystem: 'numerology', category: 'personality',   layer: 'L0', rationale: '人格數終生不變。' },
  { sourceSystem: 'numerology', category: 'digitFrequency', layer: 'L0', rationale: '數字頻率分佈終生不變。' },
  { sourceSystem: 'numerology', category: 'personalYear',  layer: 'L2', rationale: '個人年數字每年變化。' },
  { sourceSystem: 'numerology', category: 'personalMonth', layer: 'L2', rationale: '個人月數字每月變化。' },

  // ── Human Design ────────────────────────────────────────────────────
  { sourceSystem: 'humandesign', category: 'type',            layer: 'L0', rationale: '人類圖類型終生不變。' },
  { sourceSystem: 'humandesign', category: 'authority',       layer: 'L0', rationale: '內在權威終生不變。' },
  { sourceSystem: 'humandesign', category: 'profile',         layer: 'L0', rationale: '人生角色終生不變。' },
  { sourceSystem: 'humandesign', category: 'definedCenters',  layer: 'L0', rationale: '有定義的能量中心終生不變。' },
  { sourceSystem: 'humandesign', category: 'channels',        layer: 'L0', rationale: '通道連結終生不變。' },
  { sourceSystem: 'humandesign', category: 'openCenters',     layer: 'L3', rationale: '開放中心隨外在環境與互動對象而變化，為情境切換。' },
  { sourceSystem: 'humandesign', category: 'conditioning',    layer: 'L3', rationale: '制約來自外在環境，隨情境切換。' },

  // ── MingGua (八宅命卦) ───────────────────────────────────────────────
  { sourceSystem: 'minggua', category: 'mingGua',    layer: 'L0', rationale: '本命卦由出生年（立春為界）決定，終生不變。' },
  { sourceSystem: 'minggua', category: 'directions', layer: 'L0', rationale: '八宅吉凶方位由本命卦決定，終生不變。' },

  // ── Dreamspell (馬雅曆 Kin) ──────────────────────────────────────────
  { sourceSystem: 'dreamspell', category: 'kin',  layer: 'L0', rationale: 'Kin 印記由出生日期計算，終生不變。' },
  { sourceSystem: 'dreamspell', category: 'tone', layer: 'L0', rationale: '銀河音階由 Kin 決定，終生不變。' },
  { sourceSystem: 'dreamspell', category: 'seal', layer: 'L0', rationale: '圖騰由 Kin 決定，終生不變。' },

  // ── Cross-System Context ────────────────────────────────────────────
  { sourceSystem: 'vedic',       category: 'ascendant',    layer: 'L3', rationale: '上升星座代表社交面具，在初識場合較為顯著。' },
  { sourceSystem: 'vedic',       category: 'sunSign',      layer: 'L3', rationale: '太陽星座在工作與自我表達場合較為顯著。' },
  { sourceSystem: 'vedic',       category: 'moonSign',     layer: 'L3', rationale: '月亮星座在親密關係與情感場合較為顯著。' }
];

// ─── LayerClassifier ────────────────────────────────────────────────────────

/**
 * Classifies all engine-produced components into temporal layers L0–L3.
 *
 * The classifier uses a rule table that maps (sourceSystem, category) pairs to
 * layers. Unknown components default to L0 with a warning rationale.
 */
export class LayerClassifier {
  /** @type {ClassificationRule[]} */
  #rules;

  constructor() {
    this.#rules = [...CLASSIFICATION_RULES];
  }

  /**
   * Add a custom classification rule.
   *
   * @param {ClassificationRule} rule
   */
  addRule(rule) {
    if (!rule.sourceSystem || !rule.category || !rule.layer || !rule.rationale) {
      throw new Error('Classification rule requires sourceSystem, category, layer, and rationale.');
    }
    if (!['L0', 'L1', 'L2', 'L3'].includes(rule.layer)) {
      throw new Error(`Invalid layer code: "${rule.layer}". Must be L0, L1, L2, or L3.`);
    }
    this.#rules.push({ ...rule });
  }

  /**
   * Get the layer definitions (read-only).
   *
   * @returns {LayerDefinition[]}
   */
  getLayerDefinitions() {
    return LAYER_DEFINITIONS.map(d => ({ ...d }));
  }

  /**
   * Get the definition for a specific layer.
   *
   * @param {LayerCode} code
   * @returns {LayerDefinition|null}
   */
  getLayerDefinition(code) {
    return LAYER_DEFINITIONS.find(d => d.code === code) ?? null;
  }

  /**
   * Classify all components from engine results into layers.
   *
   * Expects the standard BaseEngine result format where each engine produces:
   * ```
   * {
   *   engineId: string,
   *   components: [
   *     { id, name, category, value, ... }
   *   ]
   * }
   * ```
   *
   * @param {Object[]} engineResults - Array of engine result objects
   * @returns {LayerClassification}
   */
  classify(engineResults) {
    /** @type {ClassifiedComponent[]} */
    const allComponents = [];

    for (const result of engineResults) {
      const sourceSystem = result.engineId ?? result.sourceSystem ?? 'unknown';
      const components = result.components ?? [];

      for (const component of components) {
        const classified = this.#classifyComponent(component, sourceSystem);
        allComponents.push(classified);
      }
    }

    // Group by layer
    /** @type {Record<LayerCode, ClassifiedComponent[]>} */
    const byLayer = { L0: [], L1: [], L2: [], L3: [] };
    for (const comp of allComponents) {
      byLayer[comp.layer].push(comp);
    }

    // Group by system
    /** @type {Record<string, ClassifiedComponent[]>} */
    const bySystem = {};
    for (const comp of allComponents) {
      if (!bySystem[comp.sourceSystem]) {
        bySystem[comp.sourceSystem] = [];
      }
      bySystem[comp.sourceSystem].push(comp);
    }

    return {
      layerDefinitions: this.getLayerDefinitions(),
      components: allComponents,
      byLayer,
      bySystem,
      unclassified: allComponents.filter(c => c.unclassified),
      classifiedAt: new Date().toISOString()
    };
  }

  /**
   * Classify a single component.
   *
   * @param {Object} component
   * @param {string} sourceSystem
   * @returns {ClassifiedComponent}
   */
  #classifyComponent(component, sourceSystem) {
    const category = component.category ?? '';
    const matchedRule = this.#findRule(sourceSystem, category);

    if (matchedRule) {
      return {
        id: component.id ?? `${sourceSystem}_${category}_${Date.now()}`,
        name: component.name ?? category,
        layer: matchedRule.layer,
        sourceSystem,
        category,
        value: component.value ?? null,
        rationale: matchedRule.rationale
      };
    }

    // 誠實條款：未知部件不得預設進 L0（「你是…」為最強斷言）。
    // 保守起見退到語氣最弱的 L3，並以 unclassified 標記，
    // 讓下游（StateSwitchTable / HonestyGuard / 報告）可過濾或警示。
    return {
      id: component.id ?? `${sourceSystem}_${category}_${Date.now()}`,
      name: component.name ?? category,
      layer: 'L3',
      sourceSystem,
      category,
      value: component.value ?? null,
      unclassified: true,
      rationale: `未找到分類規則，保守歸入 L3（語氣最弱層）並標記 unclassified。請為（${sourceSystem}, ${category}）補分類規則。`
    };
  }

  /**
   * Find the first matching classification rule.
   *
   * @param {string} sourceSystem
   * @param {string} category
   * @returns {ClassificationRule|null}
   */
  #findRule(sourceSystem, category) {
    return this.#rules.find(rule =>
      rule.sourceSystem === sourceSystem && rule.category === category
    ) ?? null;
  }

  /**
   * Generate a human-readable summary of the classification.
   *
   * @param {LayerClassification} classification
   * @returns {string}
   */
  summarize(classification) {
    const lines = [];
    lines.push('╔══════════════════════════════════════════╗');
    lines.push('║        層級分類摘要  Layer Summary       ║');
    lines.push('╚══════════════════════════════════════════╝');
    lines.push('');

    for (const layerDef of LAYER_DEFINITIONS) {
      const comps = classification.byLayer[layerDef.code] ?? [];
      lines.push(`── ${layerDef.code} ${layerDef.name}（${layerDef.englishName}）──`);
      lines.push(`   ${layerDef.description}`);
      lines.push(`   時間尺度：${layerDef.timeScale}`);
      lines.push(`   語言規則：${layerDef.languageRule}`);
      lines.push(`   組件數量：${comps.length}`);

      if (comps.length > 0) {
        for (const comp of comps) {
          const flag = comp.unclassified ? '（⚠ 未分類，保守歸層）' : '';
          lines.push(`     · [${comp.sourceSystem}] ${comp.name}${flag}`);
        }
      }
      lines.push('');
    }

    const unclassified = classification.unclassified ?? [];
    if (unclassified.length > 0) {
      lines.push(`⚠ 共 ${unclassified.length} 個部件未匹配任何分類規則（已保守歸入 L3），請補規則。`);
      lines.push('');
    }

    return lines.join('\n');
  }
}
