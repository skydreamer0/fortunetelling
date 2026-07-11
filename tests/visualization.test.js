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

test('ReportView.buildRadarSection 針對生命靈數數字頻次產生九宮格 HTML 與無百分比的文字降級內容', () => {
  const numerologyRadar = {
    id: 'numerology_digit_frequency',
    system: 'numerology',
    title: '生命靈數數字頻次',
    kind: 'bar',
    axes: [
      { label: '1', value: 2, unit: '次', ruleId: 'numerology_digit_frequency', assets: ['A'], liabilities: ['B'] },
      { label: '2', value: 0, unit: '次', ruleId: 'numerology_digit_frequency', assets: ['A'], liabilities: ['B'] },
      { label: '3', value: 0, unit: '次', ruleId: 'numerology_digit_frequency', assets: ['A'], liabilities: ['B'] },
      { label: '4', value: 0, unit: '次', ruleId: 'numerology_digit_frequency', assets: ['A'], liabilities: ['B'] },
      { label: '5', value: 1, unit: '次', ruleId: 'numerology_digit_frequency', assets: ['A'], liabilities: ['B'] },
      { label: '6', value: 1, unit: '次', ruleId: 'numerology_digit_frequency', assets: ['A'], liabilities: ['B'] },
      { label: '7', value: 1, unit: '次', ruleId: 'numerology_digit_frequency', assets: ['A'], liabilities: ['B'] },
      { label: '8', value: 0, unit: '次', ruleId: 'numerology_digit_frequency', assets: ['A'], liabilities: ['B'] },
      { label: '9', value: 2, unit: '次', ruleId: 'numerology_digit_frequency', assets: ['A'], liabilities: ['B'] },
    ],
  };

  const html = ReportView.buildRadarSection({
    radars: [numerologyRadar],
    scoringRules: {
      byRadarType: {
        numerology_digit_frequency: [{ id: 'numerology_digit_frequency', formula: 'digitOccurrences', description: '出現次數' }],
      },
    },
  });

  // 驗證是否包含九宮格元素，且不包含 ChartJS canvas
  assert.match(html, /class="numerology-nine-grid"/);
  assert.ok(!html.includes('data-radar-id="numerology_digit_frequency"'));

  // 驗證 1-9 的數字是否都呈現在 HTML 中
  for (let i = 1; i <= 9; i++) {
    assert.match(html, new RegExp(`class="numerology-nine-grid__digit">${i}`));
  }

  // 驗證有出現的數字（如 1）包含 active 類別
  assert.match(html, /class="numerology-nine-grid__cell numerology-nine-grid__cell--active"/);

  // 驗證文字降級條（無百分比，顯示 X次）
  assert.match(html, /1\s+[█░]+\s+2次/);
  assert.match(html, /2\s+░+\s+0次/);
  assert.match(html, /5\s+[█░]+\s+1次/);
  assert.ok(!html.includes('100%'));
  assert.ok(!html.includes('50%'));
});

test('ReportView.buildRadarSection 針對五行與宮位力量產生易讀的「計算過程」說明', () => {
  const baziRadar = {
    id: 'bazi_element_balance',
    system: 'bazi',
    title: '八字五行出現占比',
    kind: 'radar',
    axes: [
      { label: '木', value: 25, unit: '%', ruleId: 'bazi_wood_strength', inputs: { woodCount: 2, totalElements: 8 } },
    ],
  };

  const ziweiRadar = {
    id: 'ziwei_palace_strength',
    system: 'ziwei',
    title: '紫微十二宮位力量',
    kind: 'radar',
    axes: [
      { label: '遷移', value: 62, unit: '分', ruleId: 'ziwei_palace_strength', inputs: { mainStarBrightness: 100, auxiliaryStarCount: 1, fourTransformBonus: 0 } },
    ],
  };

  const html = ReportView.buildRadarSection({
    radars: [baziRadar, ziweiRadar],
    scoringRules: {
      byRadarType: {
        element_balance: [{ id: 'bazi_wood_strength', formula: '(woodCount / totalElements) * 100', description: '木五行占比' }],
        palace_strength: [{ id: 'ziwei_palace_strength', formula: '(mainStarBrightness * 0.6) + ...', description: '宮位力量' }],
      },
    },
  });

  // 驗證八字五行計算過程已格式化為中文說明且含數值
  assert.match(html, /計算過程：2 \(木行個數\) ÷ 8 \(五行總數\) × 100% = 25%/);
  // 驗證紫微斗數計算過程已格式化為中文說明且含數值
  assert.match(html, /計算過程：100 \(主星亮度\) × 60% \+ 10 \(輔星加成: 1 顆 × 10\) × 20% \+ 0 \(四化加成\) × 20% = 62分/);
  // 確保不包含 raw 的 code block
  assert.ok(!html.includes('<code>(woodCount / totalElements) * 100</code>'));
  assert.ok(!html.includes('<code>(mainStarBrightness * 0.6)</code>'));
});


