/**
 * @fileoverview Axis asset/liability notes registry.
 *
 * Every radar axis carries an `assets[]`（資產面）and `liabilities[]`（負債面）
 * so the UI can show both sides of a high-scoring axis (Block G v2). The notes
 * live here as a flat, inspectable registry — one entry per axis, keyed by
 * radar id then axis label.
 *
 * Language contract: these strings surface at every layer (L0–L3), so the
 * wording must stay neutral — use 「傾向」「常見」 and never the 「你是」
 * qualitative pattern (honesty rules, ARCHITECTURE §1.6).
 *
 * @module analysis/AxisNotes
 */

/**
 * @typedef {Object} AxisNote
 * @property {string[]} assets      - 資產面（高佔比時的可用資源描述）
 * @property {string[]} liabilities - 負債面（高佔比時的常見成本描述）
 */

/**
 * Freeze a note entry (arrays included) so registry content is immutable.
 *
 * @param {string[]} assets
 * @param {string[]} liabilities
 * @returns {AxisNote}
 */
function note(assets, liabilities) {
  return Object.freeze({
    assets: Object.freeze(assets),
    liabilities: Object.freeze(liabilities),
  });
}

/**
 * Axis notes registry: `AXIS_NOTES[radarId][axisLabel]`.
 *
 * Covers the three launch radars: 五行 5 軸、十二宮 12 軸、數字 9 軸。
 * Each axis has at least one asset and one liability.
 *
 * @type {Readonly<Record<string, Readonly<Record<string, AxisNote>>>>}
 */
export const AXIS_NOTES = Object.freeze({
  // ── 八字五行 5 軸（佔比高時的兩面性） ─────────────────────────────────
  bazi_element_balance: Object.freeze({
    木: note(
      ['佔比高時，成長、規劃與開創的行動模式較常見'],
      ['常見計畫擴張過多、難以收斂的情況'],
    ),
    火: note(
      ['佔比高時，表達、熱情與行動力的展現較常見'],
      ['常見節奏急躁、能量消耗過快的情況'],
    ),
    土: note(
      ['佔比高時，穩定、承載與信用累積的傾向較常見'],
      ['常見偏保守、變通較慢的情況'],
    ),
    金: note(
      ['佔比高時，決斷、規則與精確處理的傾向較常見'],
      ['常見要求過度嚴苛、彈性不足的情況'],
    ),
    水: note(
      ['佔比高時，流動、思考與適應的傾向較常見'],
      ['常見方向分散、飄移不定的情況'],
    ),
  }),

  // ── 紫微十二宮 12 軸（宮位力量高時的兩面性） ─────────────────────────
  ziwei_palace_strength: Object.freeze({
    命宮: note(
      ['此宮力量高時，自主性與主導傾向較常見'],
      ['常見聚焦自我步調、較難配合外部節奏'],
    ),
    兄弟: note(
      ['此宮力量高時，同儕與手足間的互助連結較常見'],
      ['常見人際比較與資源分配的張力'],
    ),
    夫妻: note(
      ['此宮力量高時，對親密關係的投入與經營較常見'],
      ['常見對關係期待偏高帶來的壓力'],
    ),
    子女: note(
      ['此宮力量高時，培育、傳承與創作的投入較常見'],
      ['常見對後輩或作品過度操心的情況'],
    ),
    財帛: note(
      ['此宮力量高時，資源調度與理財的敏感度較常見'],
      ['常見以金錢衡量安全感的傾向'],
    ),
    疾厄: note(
      ['此宮力量高時，對身心狀態的覺察較常見'],
      ['常見健康與情緒議題需額外留意'],
    ),
    遷移: note(
      ['此宮力量高時，外出發展與環境轉換的適應傾向較常見'],
      ['常見奔波與變動帶來的不穩定感'],
    ),
    僕役: note(
      ['此宮力量高時，交友圈與合作網絡的經營較常見'],
      ['常見人際承諾過多而分身乏術的情況'],
    ),
    官祿: note(
      ['此宮力量高時，事業投入與職務表現的重視較常見'],
      ['常見工作佔比偏高、壓力累積的情況'],
    ),
    田宅: note(
      ['此宮力量高時，家庭與居所的安定經營較常見'],
      ['常見對居所與歸屬感的牽掛'],
    ),
    福德: note(
      ['此宮力量高時，精神生活與興趣的滋養較常見'],
      ['常見思慮偏多、內在耗損的情況'],
    ),
    父母: note(
      ['此宮力量高時，與長輩及體制的連結與支持較常見'],
      ['常見受權威期待影響的壓力'],
    ),
  }),

  // ── 生命靈數數字 9 軸（頻次高時的兩面性） ────────────────────────────
  numerology_digit_frequency: Object.freeze({
    1: note(
      ['頻次高時，獨立與開創的傾向較常見'],
      ['常見堅持己見、偏好單打獨鬥的情況'],
    ),
    2: note(
      ['頻次高時，協調與合作的傾向較常見'],
      ['常見依賴他人意見、決斷猶豫的情況'],
    ),
    3: note(
      ['頻次高時，表達與創意的傾向較常見'],
      ['常見注意力分散、興趣切換頻繁的情況'],
    ),
    4: note(
      ['頻次高時，務實與組織的傾向較常見'],
      ['常見流程僵化、過度謹慎的情況'],
    ),
    5: note(
      ['頻次高時，追求自由與適應變化的傾向較常見'],
      ['常見缺乏定性、喜新厭舊的情況'],
    ),
    6: note(
      ['頻次高時，責任感與照顧他人的傾向較常見'],
      ['常見過度承擔他人課題的情況'],
    ),
    7: note(
      ['頻次高時，分析與內省的傾向較常見'],
      ['常見與人疏離、過度懷疑的情況'],
    ),
    8: note(
      ['頻次高時，執行力與目標管理的傾向較常見'],
      ['常見對成就與掌控的執著'],
    ),
    9: note(
      ['頻次高時，同理心與大局觀的傾向較常見'],
      ['常見過度理想化、忽略現實細節的情況'],
    ),
  }),
});

/**
 * Look up the asset/liability notes for one radar axis.
 *
 * Returns mutable copies so callers (RadarBuilder) can embed them directly in
 * a Radar without risking shared mutation. Unknown radar/axis combinations
 * return empty arrays — callers that require non-empty notes should treat that
 * as a registry gap to fill here.
 *
 * @param {string} radarId  - Radar id (e.g. 'bazi_element_balance')
 * @param {string} axisLabel - Axis display label (e.g. '木', '命宮', '7')
 * @returns {{ assets: string[], liabilities: string[] }}
 */
export function getAxisNotes(radarId, axisLabel) {
  const entry = AXIS_NOTES[radarId]?.[axisLabel];
  return {
    assets: entry ? [...entry.assets] : [],
    liabilities: entry ? [...entry.liabilities] : [],
  };
}
