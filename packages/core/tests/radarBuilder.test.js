/**
 * 契約測試：RadarBuilder（任務 C1）。
 *
 * 驗收重點：
 *   - 三張首發雷達的形狀逐字遵守 ARCHITECTURE §4.2（Radar / RadarAxis）。
 *   - 每軸 ruleId 可被 ScoringRules.getRule() 解析且非 null。
 *   - 每軸 inputs 帶實際代入值（可覆核）、assets/liabilities 非空。
 *   - 不做跨軸正規化（D-010）：兩軸同值輸入 → 同高。
 *   - personality_composite 死規則已移除（D-009）；靈數頻次規則改為次數（D-011）。
 *
 * 黃金向量：1991-10-05 14:00 女（同 tests/engines.test.js），asOf 顯式傳入（D-014）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BirthData, ScoringRules } from '../src/index.js';
import { BaZiEngine } from '../src/engines/BaZiEngine.js';
import { ZiweiEngine } from '../src/engines/ZiweiEngine.js';
import { NumerologyEngine } from '../src/engines/NumerologyEngine.js';
import {
  buildRadars,
  buildElementBalanceRadar,
} from '../src/analysis/RadarBuilder.js';
import { AXIS_NOTES, getAxisNotes } from '../src/analysis/AxisNotes.js';

const AS_OF = '2026-07-11';
const BIRTH = new BirthData({ year: 1991, month: 10, day: 5, hour: 14, gender: 'female', name: 'Test Person' });

const results = [
  new BaZiEngine({ asOf: AS_OF }).run(BIRTH),
  new ZiweiEngine({ asOf: AS_OF }).run(BIRTH),
  new NumerologyEngine({ asOf: AS_OF }).run(BIRTH),
];
const radars = buildRadars(results);
const rules = new ScoringRules();

/** @param {Object} radar */
function assertRadarContract(radar) {
  assert.equal(typeof radar.id, 'string');
  assert.equal(typeof radar.system, 'string');
  assert.equal(typeof radar.title, 'string');
  assert.ok(['radar', 'bar'].includes(radar.kind), `kind 非法: ${radar.kind}`);
  assert.ok(Array.isArray(radar.axes) && radar.axes.length > 0);

  for (const axis of radar.axes) {
    assert.equal(typeof axis.key, 'string');
    assert.equal(typeof axis.label, 'string');
    assert.equal(typeof axis.value, 'number');
    assert.ok(['%', '次', '分'].includes(axis.unit), `${radar.id}/${axis.label} unit 非法: ${axis.unit}`);
    // 每軸 ruleId 必須可被 ScoringRules.getRule() 解析且非 null
    assert.ok(rules.getRule(axis.ruleId), `${radar.id}/${axis.label} ruleId 無法解析: ${axis.ruleId}`);
    // inputs 帶實際代入值（可覆核）
    assert.equal(typeof axis.inputs, 'object');
    assert.ok(Object.keys(axis.inputs).length > 0, `${radar.id}/${axis.label} inputs 空`);
    // assets/liabilities 非空
    assert.ok(Array.isArray(axis.assets) && axis.assets.length > 0, `${radar.id}/${axis.label} assets 空`);
    assert.ok(Array.isArray(axis.liabilities) && axis.liabilities.length > 0, `${radar.id}/${axis.label} liabilities 空`);
  }
}

test('三張首發雷達齊全且符合 §4.2 元素形狀', () => {
  assert.equal(radars.length, 3);
  const byId = Object.fromEntries(radars.map(r => [r.id, r]));

  assert.equal(byId.bazi_element_balance.kind, 'radar');
  assert.equal(byId.bazi_element_balance.axes.length, 5);
  assert.equal(byId.bazi_element_balance.system, 'bazi');

  assert.equal(byId.ziwei_palace_strength.kind, 'radar');
  assert.equal(byId.ziwei_palace_strength.axes.length, 12);
  assert.equal(byId.ziwei_palace_strength.system, 'ziwei');

  assert.equal(byId.numerology_digit_frequency.kind, 'bar');
  assert.equal(byId.numerology_digit_frequency.axes.length, 9);
  assert.equal(byId.numerology_digit_frequency.system, 'numerology');

  for (const radar of radars) assertRadarContract(radar);
});

test('五行雷達：軸值總和 ≈ 100、單位 %、inputs 對應引擎實際次數', () => {
  const radar = radars.find(r => r.id === 'bazi_element_balance');
  const sum = radar.axes.reduce((acc, axis) => acc + axis.value, 0);
  assert.ok(Math.abs(sum - 100) < 0.1, `五行軸值總和 ${sum} 偏離 100`);

  const elements = results[0].byCategory('elements')[0].value;
  const inputKeys = { 木: 'woodCount', 火: 'fireCount', 土: 'earthCount', 金: 'metalCount', 水: 'waterCount' };
  for (const axis of radar.axes) {
    assert.equal(axis.unit, '%');
    const countKey = inputKeys[axis.label];
    assert.equal(axis.inputs[countKey], elements.counts[axis.label], `${axis.label} 代入值不符`);
    assert.equal(axis.inputs.totalElements, elements.total);
    // 軸值可由 inputs 依規則公式覆核
    const expected = Math.round((elements.counts[axis.label] / elements.total) * 100 * 100) / 100;
    assert.equal(axis.value, expected);
  }
});

test('宮強雷達：12 軸、單位分、軸值可由 inputs 依公式覆核', () => {
  const radar = radars.find(r => r.id === 'ziwei_palace_strength');
  assert.equal(radar.axes.length, 12);

  let bonusSeen = false;
  for (const axis of radar.axes) {
    assert.equal(axis.unit, '分');
    assert.equal(axis.ruleId, 'ziwei_palace_strength');
    const { mainStarBrightness, auxiliaryStarCount, fourTransformBonus } = axis.inputs;
    assert.ok(mainStarBrightness >= 0 && mainStarBrightness <= 100);
    assert.ok(Number.isInteger(auxiliaryStarCount) && auxiliaryStarCount >= 0);
    // 四化加成：宮內含生年四化星 → 100，否則 0
    assert.ok([0, 100].includes(fourTransformBonus), `加成非 0/100: ${fourTransformBonus}`);
    if (fourTransformBonus === 100) bonusSeen = true;

    const expected = Math.round((
      mainStarBrightness * 0.6
      + Math.min(auxiliaryStarCount * 10, 100) * 0.2
      + fourTransformBonus * 0.2
    ) * 100) / 100;
    assert.equal(axis.value, expected, `${axis.label} 軸值與公式不符`);
    assert.ok(axis.value >= 0 && axis.value <= 100);
  }
  // 1991 命盤有生年四化（祿權科忌各一），至少一宮取得加成
  assert.ok(bonusSeen, '無任何宮位取得生年四化加成');
});

test('數字頻次 bar：1991-10-05 → {1:3, 9:2, 5:1, 其餘 0}，單位次', () => {
  const radar = radars.find(r => r.id === 'numerology_digit_frequency');
  const expected = { 1: 3, 2: 0, 3: 0, 4: 0, 5: 1, 6: 0, 7: 0, 8: 0, 9: 2 };
  for (const axis of radar.axes) {
    assert.equal(axis.unit, '次');
    assert.equal(axis.value, expected[axis.label], `數字 ${axis.label} 頻次不符`);
    assert.equal(axis.inputs.digitOccurrences, axis.value);
  }
});

test('D-010：兩軸同值輸入 → 同高（不做跨軸正規化）', () => {
  const synthetic = {
    engineId: 'bazi',
    components: [{
      id: 'elements',
      name: '五行出現次數',
      category: 'elements',
      value: { counts: { 木: 2, 火: 2, 土: 1, 金: 0, 水: 0 }, total: 5 },
    }],
  };
  const radar = buildElementBalanceRadar(synthetic);
  const byLabel = Object.fromEntries(radar.axes.map(a => [a.label, a.value]));
  assert.equal(byLabel.木, byLabel.火, '同值輸入的兩軸高度不同');
  assert.equal(byLabel.木, 40);
  assert.equal(byLabel.金, byLabel.水);
  assert.equal(byLabel.金, 0);
});

test('缺引擎資料時僅產出可支撐的雷達，不編造', () => {
  const numerologyOnly = buildRadars([results[2]]);
  assert.equal(numerologyOnly.length, 1);
  assert.equal(numerologyOnly[0].id, 'numerology_digit_frequency');
  assert.deepEqual(buildRadars([]), []);
});

test('D-009：personality_composite 死規則已移除', () => {
  assert.deepEqual(rules.getRulesForRadar('personality_composite'), []);
  for (const id of ['cross_leadership', 'cross_creativity', 'cross_emotional_depth', 'cross_analytical', 'cross_resilience']) {
    assert.equal(rules.getRule(id), null, `${id} 應已移除`);
  }
});

test('D-011：靈數頻次規則改為次數（次 / digitOccurrences / max 8）', () => {
  const rule = rules.getRule('numerology_digit_frequency');
  assert.ok(rule);
  assert.equal(rule.unit, '次');
  assert.equal(rule.formula, 'digitOccurrences');
  assert.equal(rule.maxValue, 8);
  assert.equal(rule.minValue, 0);
});

test('宮強規則 description 已更新為生年四化加成定義', () => {
  const rule = rules.getRule('ziwei_palace_strength');
  assert.ok(rule.description.includes('生年四化'), 'description 未提及生年四化');
  assert.ok(rule.description.includes('100'), 'description 未寫明加成值 100');
});

test('AxisNotes：全部 26 軸皆有非空資產/負債，且無「你是」句式', () => {
  const expectedKeys = {
    bazi_element_balance: ['木', '火', '土', '金', '水'],
    ziwei_palace_strength: ['命宮', '兄弟', '夫妻', '子女', '財帛', '疾厄', '遷移', '僕役', '官祿', '田宅', '福德', '父母'],
    numerology_digit_frequency: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
  };
  for (const [radarId, labels] of Object.entries(expectedKeys)) {
    assert.deepEqual(Object.keys(AXIS_NOTES[radarId]).sort(), [...labels].sort());
    for (const label of labels) {
      const { assets, liabilities } = getAxisNotes(radarId, label);
      assert.ok(assets.length >= 1, `${radarId}/${label} 缺資產面`);
      assert.ok(liabilities.length >= 1, `${radarId}/${label} 缺負債面`);
      for (const text of [...assets, ...liabilities]) {
        assert.ok(!text.includes('你是'), `${radarId}/${label} 含「你是」句式: ${text}`);
      }
    }
  }
  // 未知軸回傳空陣列（登錄表缺口的明確訊號）
  assert.deepEqual(getAxisNotes('unknown', 'x'), { assets: [], liabilities: [] });
});
