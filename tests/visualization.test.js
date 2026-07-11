import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRadarChartConfig } from '../src/visualization/RadarChart.js';
import { buildBarChartConfig } from '../src/visualization/BarChart.js';
import * as ReportView from '../src/ui/ReportView.js';

test('C3 提供 radar 與 bar 的 Chart.js 轉接層', async () => {
  await assert.doesNotReject(() => import('../src/visualization/RadarChart.js'));
  await assert.doesNotReject(() => import('../src/visualization/BarChart.js'));
});

const radar = {
  id: 'sample', system: 'bazi', title: '測試雷達', kind: 'radar',
  axes: [
    { label: '木', value: 60, unit: '%', ruleId: 'rule_wood', assets: ['生長'], liabilities: ['躁進'] },
    { label: '水', value: 40, unit: '%', ruleId: 'rule_water', assets: ['流動'], liabilities: ['游移'] },
  ],
};

test('RadarChart 將 Radar 軸映射為共用主題的 Chart.js config', () => {
  const config = buildRadarChartConfig(radar);

  assert.equal(config.type, 'radar');
  assert.deepEqual(config.data.labels, ['木', '水']);
  assert.deepEqual(config.data.datasets[0].data, [60, 40]);
  assert.equal(config.options.scales.r.max, 100);
  assert.equal(config.options.responsive, true);
  assert.equal(config.options.maintainAspectRatio, false);
});

test('BarChart 保留原始次數並使用水平 bar', () => {
  const bar = {
    ...radar, system: 'numerology', title: '數字頻次', kind: 'bar',
    axes: [
      { label: '1', value: 3, unit: '次' },
      { label: '2', value: 0, unit: '次' },
    ],
  };
  const config = buildBarChartConfig(bar);

  assert.equal(config.type, 'bar');
  assert.equal(config.options.indexAxis, 'y');
  assert.deepEqual(config.data.labels, ['1', '2']);
  assert.deepEqual(config.data.datasets[0].data, [3, 0]);
  assert.equal(config.options.scales.x.beginAtZero, true);
});

test('ReportView 為每張 Radar 產生 canvas、規則與文字降級內容', () => {
  assert.equal(typeof ReportView.buildRadarSection, 'function');
  const html = ReportView.buildRadarSection({
    radars: [radar],
    scoringRules: {
      byRadarType: {
        element_balance: [{ id: 'rule_wood', formula: 'wood / total × 100', description: '出現占比' }],
      },
    },
  });

  assert.match(html, /<canvas[^>]+data-radar-id="sample"/);
  assert.match(html, /wood \/ total × 100/);
  assert.match(html, /<details/);
  assert.match(html, /文字長條/);
  assert.match(html, /資產面/);
  assert.match(html, /負債面/);
});
