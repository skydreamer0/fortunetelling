/**
 * 整合測試：analyze() 對外契約（Report 形狀與內容保證）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, VERSION, REPORT_SCHEMA_VERSION, BirthData } from '../src/index.js';

const INPUT = { year: 1991, month: 10, day: 5, hour: 14, gender: 'female', name: 'Test Person' };
const AS_OF = '2026-07-11';

test('analyze() 回傳完整 Report 契約欄位', () => {
  const report = analyze(INPUT, { asOf: AS_OF });

  assert.equal(report.version, VERSION);
  assert.equal(report.schemaVersion, REPORT_SCHEMA_VERSION);
  assert.equal(report.asOf, AS_OF);
  assert.ok(report.generatedAt);
  assert.deepEqual(
    { year: report.input.year, month: report.input.month, day: report.input.day, gender: report.input.gender },
    { year: 1991, month: 10, day: 5, gender: 'female' },
  );

  // G/H 進階欄位：穩定空殼必須存在（shape 從第一天就定案）
  assert.ok(Array.isArray(report.radars));
  assert.ok(Array.isArray(report.stateTable.scenarios));
  assert.ok(Array.isArray(report.evolution.periods));
  assert.ok(Array.isArray(report.honesty.violations));
  assert.equal(report.honesty.languageRules.length, 4);

  // D1：honesty 稽核已接線 — honesty.pending 翻為 false，含 D2 產文在內零違規
  assert.equal(report.honesty.pending, false);
  assert.deepEqual(report.honesty.violations, []);

  // D2：stateTable 已接線 — 5 固定情境、pending 翻為 false
  assert.equal(report.stateTable.pending, false);
  assert.deepEqual(
    report.stateTable.scenarios.map(s => s.id),
    ['first_meeting', 'intimate_stable', 'conflict', 'low_pressure', 'workplace'],
  );

  // D4：evolution 已接線 — bazi 10 步大運 + ziwei 12 大限、敘事非空、pending 翻為 false
  assert.equal(report.evolution.pending, false);
  assert.equal(report.evolution.periods.filter(p => p.system === 'bazi').length, 10);
  assert.equal(report.evolution.periods.filter(p => p.system === 'ziwei').length, 12);
  assert.ok(report.evolution.narrative.length > 0);
});

test('Report 頂層欄位集合完全不變（Schema v1 凍結，D-012）', () => {
  const report = analyze(INPUT, { asOf: AS_OF });
  assert.deepEqual(
    Object.keys(report).sort(),
    [
      'asOf', 'engines', 'evolution', 'generatedAt', 'honesty', 'input',
      'layers', 'radars', 'schemaVersion', 'scoringRules', 'stateTable', 'version',
    ],
  );
  // D1/D2/D4 已翻 honesty / stateTable / evolution 的 pending
  assert.equal(report.stateTable.pending, false);
  assert.equal(report.evolution.pending, false);
  assert.equal(report.honesty.pending, false);
});

test('analyze() 只填入既有 radars 空殼，且每軸計分規則可解析', () => {
  const report = analyze(INPUT, { asOf: AS_OF });
  const radarIds = report.radars.map(radar => radar.id);
  const ruleIds = new Set(
    Object.values(report.scoringRules.byRadarType)
      .flat()
      .map(rule => rule.id),
  );

  assert.ok(report.radars.length >= 3);
  assert.ok(radarIds.includes('bazi_element_balance'));
  assert.ok(radarIds.includes('ziwei_palace_strength'));
  assert.ok(radarIds.includes('numerology_digit_frequency'));

  for (const radar of report.radars) {
    assert.ok(radar.axes.length > 0, `${radar.id} 缺少軸資料`);
    for (const axis of radar.axes) {
      assert.ok(ruleIds.has(axis.ruleId), `${radar.id}/${axis.label} ruleId 無法解析: ${axis.ruleId}`);
    }
  }

  assert.deepEqual(
    Object.keys(report).sort(),
    [
      'asOf', 'engines', 'evolution', 'generatedAt', 'honesty', 'input',
      'layers', 'radars', 'schemaVersion', 'scoringRules', 'stateTable', 'version',
    ],
  );
});

test('預設引擎全數執行且零錯誤', () => {
  const report = analyze(INPUT, { asOf: AS_OF });
  assert.ok(report.engines.some(engine => engine.engineId === 'bazi'), '缺少 bazi 引擎');
  for (const engine of report.engines) {
    assert.equal(engine.errors.length, 0, `${engine.engineId} 有錯誤: ${engine.errors.join('; ')}`);
    assert.ok(engine.components.length > 0, `${engine.engineId} 無部件輸出`);
  }
});

test('分層結果：L0/L1/L2/L3 皆非空、無未分類部件', () => {
  const report = analyze(INPUT, { asOf: AS_OF });
  const { byLayer, unclassified } = report.layers;
  for (const layer of ['L0', 'L1', 'L2', 'L3']) {
    assert.ok(byLayer[layer].length > 0, `${layer} 為空`);
  }
  assert.equal(unclassified.length, 0,
    `未分類部件: ${unclassified.map(c => `${c.sourceSystem}/${c.category}`).join(', ')}`);

  const baziComponents = report.engines.find(engine => engine.engineId === 'bazi').components;
  const baziL0Components = baziComponents.filter(c => ['natal', 'dayMaster', 'elements', 'tenGods'].includes(c.category));
  assert.equal(baziL0Components.length, 4);
  for (const component of baziL0Components) {
    const classified = byLayer.L0.find(item => item.sourceSystem === 'bazi' && item.id === component.id);
    assert.ok(classified, `bazi/${component.category} 未歸入 L0`);
  }

  const tenGodsContext = byLayer.L3.find(
    item => item.sourceSystem === 'bazi' && item.id === 'tenGodsContext',
  );
  assert.ok(tenGodsContext, 'bazi/tenGodsContext 未歸入 L3');
  assert.equal(tenGodsContext.unclassified, undefined);
});

test('scoringRules 匯出可覆核（每條規則帶公式與範圍）', () => {
  const report = analyze(INPUT, { asOf: AS_OF });
  assert.ok(report.scoringRules.totalRules > 0);
  for (const rules of Object.values(report.scoringRules.byRadarType)) {
    for (const rule of rules) {
      assert.ok(rule.formula, `${rule.id} 缺公式`);
      assert.ok(rule.maxValue >= rule.minValue, `${rule.id} 範圍不合法`);
    }
  }
});

test('接受 BirthData 實例作為輸入', () => {
  const birth = new BirthData(INPUT);
  const report = analyze(birth, { asOf: AS_OF });
  assert.ok(report.engines.some(engine => engine.engineId === 'bazi'));
});

test('無效輸入快速失敗', () => {
  assert.throws(() => analyze({ year: 1991, month: 13, day: 5 }));
  assert.throws(() => analyze(INPUT, { asOf: 'not-a-date' }));
});
