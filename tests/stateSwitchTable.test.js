/**
 * D2 契約測試：StateSwitchTable（區塊 H② 狀態切換表）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BirthData,
  ZiweiEngine,
  BaZiEngine,
  HonestyGuard,
  StateSwitchTable,
  SCENARIO_DEFINITIONS,
  CATEGORY_SCENARIO_MAP,
  TEN_GOD_GROUP_SCENARIO_MAP,
} from '../src/index.js';
import { LayerClassifier } from '../src/analysis/LayerClassifier.js';

const BIRTH = new BirthData({ year: 1991, month: 10, day: 5, hour: 14, gender: 'female', name: 'Test Person' });
const AS_OF = '2026-07-11';

const SCENARIO_IDS = ['first_meeting', 'intimate_stable', 'conflict', 'low_pressure', 'workplace'];
const SCENARIO_NAMES = ['初識場合', '親密關係穩定期', '衝突當下', '壓力低谷', '工作場域'];

/** 跑 ziwei + bazi 兩個 L3 來源引擎並分層（顯式 asOf，D-014）。 */
function classifyFull() {
  const results = [
    new ZiweiEngine({ asOf: AS_OF }).run(BIRTH),
    new BaZiEngine({ asOf: AS_OF }).run(BIRTH),
  ];
  return { results, classification: new LayerClassifier().classify(results) };
}

test('恰好 5 個情境、id 與 name 固定且順序不變', () => {
  const { classification } = classifyFull();
  const scenarios = StateSwitchTable.build(classification);

  assert.equal(scenarios.length, 5);
  assert.deepEqual(scenarios.map(s => s.id), SCENARIO_IDS);
  assert.deepEqual(scenarios.map(s => s.name), SCENARIO_NAMES);
  assert.deepEqual(SCENARIO_DEFINITIONS.map(d => d.id), SCENARIO_IDS);
});

test('1991 案例至少 3 個情境有 cells', () => {
  const { classification } = classifyFull();
  const scenarios = StateSwitchTable.build(classification);
  const withCells = scenarios.filter(s => s.cells.length > 0);
  assert.ok(withCells.length >= 3,
    `僅 ${withCells.length} 個情境有 cells：${withCells.map(s => s.id).join(', ')}`);
});

test('Cell 契約：sources ≥1 且指向真實部件、hypothesis 恆為 true、expression 過 L3 lint 且用「在…情境下你會傾向…」模板', () => {
  const { classification } = classifyFull();
  const componentIds = new Set(classification.components.map(c => `${c.sourceSystem}/${c.id}`));
  const scenarios = StateSwitchTable.build(classification);

  let checkedCells = 0;
  for (const scenario of scenarios) {
    for (const cell of scenario.cells) {
      checkedCells += 1;
      assert.deepEqual(Object.keys(cell).sort(), ['expression', 'hypothesis', 'sources']);
      assert.equal(cell.hypothesis, true);
      assert.ok(cell.sources.length >= 1);
      for (const source of cell.sources) {
        assert.deepEqual(Object.keys(source).sort(), ['componentId', 'name', 'system']);
        assert.ok(componentIds.has(`${source.system}/${source.componentId}`),
          `來源 ${source.system}/${source.componentId} 不存在於分層部件中`);
      }
      assert.match(cell.expression, new RegExp(`^在${scenario.name}情境下，你會傾向`));
      const { ok, problems } = HonestyGuard.lint(cell.expression, 'L3');
      assert.ok(ok, `L3 lint 違規：${problems.join('；')}（${cell.expression}）`);
    }
  }
  assert.ok(checkedCells > 0, '整張表沒有任何 cell 可驗');
});

test('Scenario 契約：insufficientData 與 cells 空值一致（D-008）', () => {
  const { classification } = classifyFull();
  for (const scenario of StateSwitchTable.build(classification)) {
    assert.deepEqual(Object.keys(scenario).sort(), ['cells', 'id', 'insufficientData', 'name']);
    assert.equal(scenario.insufficientData, scenario.cells.length === 0);
  }
});

test('斷開 bazi（只含 ziwei）：親密關係穩定期 insufficientData === true', () => {
  const classification = new LayerClassifier().classify([new ZiweiEngine({ asOf: AS_OF }).run(BIRTH)]);
  const scenarios = StateSwitchTable.build(classification);

  const intimate = scenarios.find(s => s.id === 'intimate_stable');
  assert.equal(intimate.insufficientData, true);
  assert.deepEqual(intimate.cells, []);

  // ziwei 的 soulVsBody / sanFangSiZheng 仍可支撐初識、衝突、工作
  for (const id of ['first_meeting', 'conflict', 'workplace']) {
    const scenario = scenarios.find(s => s.id === id);
    assert.ok(scenario.cells.length > 0, `${id} 應由 ziwei L3 部件支撐`);
  }
});

test('空輸入：5 情境全部 insufficientData、cells 空（禁止編故事）', () => {
  const scenarios = StateSwitchTable.build(new LayerClassifier().classify([]));
  assert.equal(scenarios.length, 5);
  for (const scenario of scenarios) {
    assert.equal(scenario.insufficientData, true);
    assert.deepEqual(scenario.cells, []);
  }
});

test('unclassified 的保守歸層部件不得產生 cells', () => {
  const classification = new LayerClassifier().classify([
    { engineId: 'mystery', components: [{ id: 'x', name: '未知部件', category: 'soulVsBody-like', value: {} }] },
  ]);
  assert.equal(classification.unclassified.length, 1);
  const scenarios = StateSwitchTable.build(classification);
  for (const scenario of scenarios) {
    assert.deepEqual(scenario.cells, []);
  }
});

test('映射表已匯出且覆蓋全部 5 情境（可擴充契約）', () => {
  assert.deepEqual(CATEGORY_SCENARIO_MAP.soulVsBody, ['first_meeting', 'workplace']);
  assert.deepEqual(CATEGORY_SCENARIO_MAP.sanFangSiZheng, ['conflict', 'workplace']);

  const mapped = new Set([
    ...Object.values(CATEGORY_SCENARIO_MAP).flat(),
    ...Object.values(TEN_GOD_GROUP_SCENARIO_MAP).flat(),
  ]);
  assert.deepEqual([...mapped].sort(), [...SCENARIO_IDS].sort());
  // 五個十神關係角色群都有映射
  assert.deepEqual(Object.keys(TEN_GOD_GROUP_SCENARIO_MAP).sort(),
    ['印星', '比劫', '官殺', '財星', '食傷'].sort());
});
