/**
 * 契約測試：LayerClassifier 分層規則（含審計修正的 4 個偏差回歸）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LayerClassifier } from '../src/index.js';

const classifier = new LayerClassifier();

/** 快速分類單一部件並回傳結果。 */
function classifyOne(sourceSystem, category) {
  const c = classifier.classify([
    { engineId: sourceSystem, components: [{ id: 'x', name: 'x', category, value: {} }] },
  ]);
  return c.components[0];
}

test('偏差1回歸：antardasha（印占中運）屬 L2 年變層', () => {
  assert.equal(classifyOne('vedic', 'antardasha').layer, 'L2');
});

test('偏差3回歸：紫微/八字的 L3 情境規則存在', () => {
  assert.equal(classifyOne('ziwei', 'soulVsBody').layer, 'L3');
  assert.equal(classifyOne('ziwei', 'sanFangSiZheng').layer, 'L3');
  assert.equal(classifyOne('bazi', 'tenGodsContext').layer, 'L3');
  // 十神「格局」本身仍是 L0 結構，不因 L3 顯隱規則而動
  assert.equal(classifyOne('bazi', 'tenGods').layer, 'L0');
});

test('偏差4回歸：未知部件保守歸 L3 並標 unclassified，絕不進 L0', () => {
  const comp = classifyOne('mystery', 'weird');
  assert.notEqual(comp.layer, 'L0');
  assert.equal(comp.layer, 'L3');
  assert.equal(comp.unclassified, true);
});

test('classification.unclassified 陣列收錄 fallback 部件', () => {
  const c = classifier.classify([
    { engineId: 'ziwei', components: [{ id: 'a', name: 'a', category: 'natal', value: {} }] },
    { engineId: 'mystery', components: [{ id: 'b', name: 'b', category: 'weird', value: {} }] },
  ]);
  assert.equal(c.unclassified.length, 1);
  assert.equal(c.unclassified[0].sourceSystem, 'mystery');
});

test('四層定義各帶語言規則（誠實條款的資料源）', () => {
  const defs = classifier.getLayerDefinitions();
  assert.deepEqual(defs.map(d => d.code), ['L0', 'L1', 'L2', 'L3']);
  assert.equal(defs[0].languageRule, '你是…');
  assert.ok(defs[1].languageRule.includes('這段時期'));
  assert.ok(defs[3].languageRule.includes('情境'));
});

test('八字/紫微時間層歸屬：大運大限 L1、流年小限 L2', () => {
  assert.equal(classifyOne('bazi', 'daYun').layer, 'L1');
  assert.equal(classifyOne('ziwei', 'daXian').layer, 'L1');
  assert.equal(classifyOne('bazi', 'liuNian').layer, 'L2');
  assert.equal(classifyOne('ziwei', 'xiaoXian').layer, 'L2');
  assert.equal(classifyOne('ziwei', 'flyingStars').layer, 'L2');
});
