/**
 * @fileoverview StateSwitchTable（區塊 H②）— 狀態切換表。
 *
 * 吃 {@link import('./LayerClassifier.js').LayerClassification}，把 L3 情境部件
 * 映射成 5 個固定情境（形狀見 ARCHITECTURE.md §4.2 Scenario/Cell）：
 *
 *   first_meeting   初識場合
 *   intimate_stable 親密關係穩定期
 *   conflict        衝突當下
 *   low_pressure    壓力低谷
 *   workplace       工作場域
 *
 * 映射表可擴充且對外匯出：
 *   - `CATEGORY_SCENARIO_MAP`：`soulVsBody`→初識/工作；`sanFangSiZheng`→衝突/工作。
 *   - `TEN_GOD_GROUP_SCENARIO_MAP`：`tenGodsContext` 五群依語意→親密/衝突/工作/壓力低谷。
 *
 * 誠實條款：
 *   - 每格 `sources` ≥1、`hypothesis: true`（⚠️待驗證假說）。
 *   - expression 一律用「在…情境下你會傾向…」模板，產文當下即過
 *     `HonestyGuard.lint(text, 'L3')`，違規直接拋錯（程式缺陷，不得出貨）。
 *   - 無來源部件的情境 `insufficientData: true`、cells 空——禁止編故事（D-008）。
 *
 * 純函數、無引擎依賴（analysis 層不得 import engines，D-016）。
 *
 * @module analysis/StateSwitchTable
 */

import { HonestyGuard } from './HonestyGuard.js';

// ─── Type Definitions ───────────────────────────────────────────────────────

/**
 * @typedef {import('./LayerClassifier.js').LayerClassification} LayerClassification
 * @typedef {import('./LayerClassifier.js').ClassifiedComponent} ClassifiedComponent
 */

/**
 * @typedef {'first_meeting'|'intimate_stable'|'conflict'|'low_pressure'|'workplace'} ScenarioId
 */

/**
 * @typedef {Object} Cell
 * @property {{ system: string, componentId: string, name: string }[]} sources - 至少 1 個
 * @property {string} expression - 「在…情境下你會傾向…」語氣（過 HonestyGuard L3）
 * @property {true} hypothesis   - 恆為 true：⚠️待驗證假說
 */

/**
 * @typedef {Object} Scenario
 * @property {ScenarioId} id
 * @property {string} name
 * @property {Cell[]} cells
 * @property {boolean} insufficientData - true 時 UI 顯示「資料不足」
 */

// ─── Scenario & Mapping Registries（可擴充、對外匯出）────────────────────────

/**
 * 5 固定情境（id 與 name 依 ARCHITECTURE §4.2，順序固定）。
 * @type {ReadonlyArray<{ id: ScenarioId, name: string }>}
 */
export const SCENARIO_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'first_meeting', name: '初識場合' }),
  Object.freeze({ id: 'intimate_stable', name: '親密關係穩定期' }),
  Object.freeze({ id: 'conflict', name: '衝突當下' }),
  Object.freeze({ id: 'low_pressure', name: '壓力低谷' }),
  Object.freeze({ id: 'workplace', name: '工作場域' }),
]);

/**
 * 部件 category → 適用情境。新 category 直接加一鍵即可。
 * @type {Record<string, ScenarioId[]>}
 */
export const CATEGORY_SCENARIO_MAP = {
  soulVsBody: ['first_meeting', 'workplace'],
  sanFangSiZheng: ['conflict', 'workplace'],
};

/**
 * `tenGodsContext` 各關係角色群 → 適用情境（依各群語意）。
 * 官殺=規範與權威、財星=資源與交換、食傷=表達與產出、
 * 印星=學習與支持、比劫=同儕與競合。
 * @type {Record<string, ScenarioId[]>}
 */
export const TEN_GOD_GROUP_SCENARIO_MAP = {
  官殺: ['workplace', 'conflict'],
  財星: ['workplace', 'intimate_stable'],
  食傷: ['intimate_stable', 'workplace'],
  印星: ['low_pressure', 'intimate_stable'],
  比劫: ['conflict', 'low_pressure'],
};

/**
 * `tenGodsContext` 各群在各情境下的行為子句（接在「你會傾向」後）。
 * @type {Record<string, Partial<Record<ScenarioId, string>>>}
 */
export const TEN_GOD_GROUP_EXPRESSIONS = {
  官殺: {
    workplace: '對制度、規範與上級要求較為敏感，常見以對接規則的方式行事',
    conflict: '先對照規則與立場再回應，常見以講理或訴諸權威的方式處理張力',
  },
  財星: {
    workplace: '關注資源分配與交換的實際效益，常見以務實盤點的方式推進事務',
    intimate_stable: '以實際付出與資源共享表達在意，常見用具體行動維繫關係',
  },
  食傷: {
    intimate_stable: '以表達、分享與創造互動維繫關係，常見主動製造交流話題',
    workplace: '以產出與表達爭取空間，常見透過作品或意見展現自己',
  },
  印星: {
    low_pressure: '向支持系統與學習汲取恢復力，常見以沉澱、閱讀或求教方式修復',
    intimate_stable: '在被理解與被支持時較為安定，常見重視對方給予的涵容',
  },
  比劫: {
    conflict: '以同儕比較與競合的框架理解對立，常見直接表態、據理力爭',
    low_pressure: '從同儕與朋友的陪伴獲得支撐，常見找同伴分擔而非獨自硬撐',
  },
};

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * 主星清單 → 顯示字串（空清單以「無主星」明示，不留空洞）。
 *
 * @param {{ majorStars?: { name: string }[] } | null | undefined} facet
 * @returns {string}
 */
function starsLabel(facet) {
  const names = (facet?.majorStars ?? []).map(star => star.name);
  return names.length > 0 ? names.join('、') : '無主星';
}

/**
 * 產文即檢：expression 必須通過 HonestyGuard L3 lint，違規是程式缺陷。
 *
 * @param {string} expression
 * @returns {string}
 */
function lintedL3(expression) {
  const { ok, problems } = HonestyGuard.lint(expression, 'L3');
  if (!ok) {
    throw new Error(`StateSwitchTable 產文違反 L3 語言規則：${problems.join('；')}（原文：${expression}）`);
  }
  return expression;
}

/**
 * @param {ClassifiedComponent} component
 * @returns {{ system: string, componentId: string, name: string }}
 */
function toSource(component) {
  return { system: component.sourceSystem, componentId: component.id, name: component.name };
}

/**
 * soulVsBody 部件 → 各情境的 expression。
 *
 * @param {ClassifiedComponent} component
 * @param {ScenarioId} scenarioId
 * @param {string} scenarioName
 * @returns {string|null}
 */
function soulVsBodyExpression(component, scenarioId, scenarioName) {
  const { samePalace, soul, body } = component.value ?? {};
  if (!soul || !body) return null;
  const soulStars = starsLabel(soul);
  const bodyStars = starsLabel(body);

  if (scenarioId === 'first_meeting') {
    return samePalace
      ? `在${scenarioName}情境下，你會傾向表裡較一致地展現命身同宮（${soul.name}：${soulStars}）的樣貌。`
      : `在${scenarioName}情境下，你會傾向先展現命宮（${soulStars}）的先天樣貌，互動加深後較常見身宮（${body.name}：${bodyStars}）的反應方式。`;
  }
  if (scenarioId === 'workplace') {
    return samePalace
      ? `在${scenarioName}情境下，你會傾向以命身同宮（${soul.name}：${soulStars}）的單一軸線投入經營，先天格局與後天發展較不分軌。`
      : `在${scenarioName}情境下，你會傾向以身宮（${body.name}：${bodyStars}）代表的後天發展方式投入，並以命宮（${soulStars}）為底色。`;
  }
  return null;
}

/**
 * sanFangSiZheng 部件 → 各情境的 expression。
 *
 * @param {ClassifiedComponent} component
 * @param {ScenarioId} scenarioId
 * @param {string} scenarioName
 * @returns {string|null}
 */
function sanFangExpression(component, scenarioId, scenarioName) {
  const { anchor, target, opposite, wealth, career } = component.value ?? {};
  if (!anchor || !target) return null;

  if (scenarioId === 'conflict') {
    const surround = [opposite, wealth, career].filter(Boolean).map(facet => facet.name).join('、');
    return `在${scenarioName}情境下，你會傾向調用${anchor}三方四正（會照 ${surround}）的組合來回應張力，常見同時被對宮視角牽動。`;
  }
  if (scenarioId === 'workplace') {
    const careerLabel = career ? `官祿位「${career.name}」（${starsLabel(career)}）` : '官祿位';
    const wealthLabel = wealth ? `財帛位「${wealth.name}」（${starsLabel(wealth)}）` : '財帛位';
    return `在${scenarioName}情境下，你會傾向受${anchor}三方四正中${careerLabel}與${wealthLabel}的配置影響做事節奏與取捨。`;
  }
  return null;
}

/**
 * tenGodsContext 部件 → 各群在各情境的 Cell[]（presence 為「無」的群不產格，
 * 沒觀察到的角色群不得編故事，D-008）。
 *
 * @param {ClassifiedComponent} component
 * @param {ScenarioId} scenarioId
 * @param {string} scenarioName
 * @returns {Cell[]}
 */
function tenGodsCells(component, scenarioId, scenarioName) {
  /** @type {Cell[]} */
  const cells = [];
  for (const group of component.value?.groups ?? []) {
    if (!group || group.count <= 0) continue;
    const scenarioIds = TEN_GOD_GROUP_SCENARIO_MAP[group.group] ?? [];
    if (!scenarioIds.includes(scenarioId)) continue;
    const clause = TEN_GOD_GROUP_EXPRESSIONS[group.group]?.[scenarioId];
    if (!clause) continue;

    const presenceNote = group.presence === '顯' ? '天干外顯' : '僅藏干內隱';
    cells.push({
      sources: [toSource(component)],
      expression: lintedL3(
        `在${scenarioName}情境下，你會傾向${clause}（${group.group}・${group.context}：${presenceNote}，佔比 ${Math.round(group.share * 100)}%）。`,
      ),
      hypothesis: true,
    });
  }
  return cells;
}

// ─── StateSwitchTable ───────────────────────────────────────────────────────

/**
 * 狀態切換表產生器。全部為靜態純函數，無內部狀態。
 */
export class StateSwitchTable {
  /**
   * 由分層結果組出 5 個固定情境。
   *
   * 只消費「已正式分類」的 L3 情境部件（`unclassified` 的保守歸層部件不消費，
   * 其語意未經確認）；無來源部件的情境回傳 `insufficientData: true` 空格。
   *
   * @param {LayerClassification} classification
   * @returns {Scenario[]} 恆為 5 個、順序固定
   */
  static build(classification) {
    const l3Components = (classification?.byLayer?.L3 ?? []).filter(c => !c.unclassified);

    return SCENARIO_DEFINITIONS.map(({ id, name }) => {
      /** @type {Cell[]} */
      const cells = [];

      for (const component of l3Components) {
        if (component.category === 'tenGodsContext') {
          cells.push(...tenGodsCells(component, id, name));
          continue;
        }

        const scenarioIds = CATEGORY_SCENARIO_MAP[component.category] ?? [];
        if (!scenarioIds.includes(id)) continue;

        const expression =
          component.category === 'soulVsBody' ? soulVsBodyExpression(component, id, name)
          : component.category === 'sanFangSiZheng' ? sanFangExpression(component, id, name)
          : null;
        if (!expression) continue;

        cells.push({ sources: [toSource(component)], expression: lintedL3(expression), hypothesis: true });
      }

      return { id, name, cells, insufficientData: cells.length === 0 };
    });
  }
}
