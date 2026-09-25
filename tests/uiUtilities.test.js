import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLOSSARY } from '../src/ui/Glossary.js';
import { preferredTheme, THEME_STORE_KEY } from '../src/ui/ThemeController.js';
import { buildCompatibilityChartConfig } from '../src/visualization/CompatibilityChart.js';

function storageWith(value) {
  return { getItem: key => key === THEME_STORE_KEY ? value : null };
}

test('主題優先使用本地選擇，沒有選擇時跟隨系統', () => {
  assert.equal(preferredTheme(storageWith('dark'), { matches: false }), 'dark');
  assert.equal(preferredTheme(storageWith('light'), { matches: true }), 'light');
  assert.equal(preferredTheme(storageWith(null), { matches: true }), 'dark');
  assert.equal(preferredTheme(storageWith(null), { matches: false }), 'light');
});

test('術語詞彙表覆蓋核心紫微、八字與時間詞彙', () => {
  for (const term of ['三方四正', '四化', '藏干', '十神', '日主', '命宮', '身宮', '大運', '大限', '流年', '喜用神']) {
    assert.ok(GLOSSARY[term]?.length >= 15, `${term} 缺少白話定義`);
  }
});

test('合盤雷達產生互補與摩擦兩組資料集', () => {
  const config = buildCompatibilityChartConfig({
    axes: [
      { label: '木', complement: 80, friction: 20, firstShare: 10, secondShare: 30, combinedShare: 20 },
      { label: '火', complement: 60, friction: 40, firstShare: 30, secondShare: 30, combinedShare: 30 },
    ],
  });
  assert.equal(config.type, 'radar');
  assert.deepEqual(config.data.labels, ['木', '火']);
  assert.deepEqual(config.data.datasets.map(dataset => dataset.data), [[80, 60], [20, 40]]);
  assert.equal(config.options.scales.r.max, 100);
});
