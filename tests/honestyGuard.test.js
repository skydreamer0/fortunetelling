/**
 * 單元測試：HonestyGuard（D1）— lint 分層語言規則與 auditReport 稽核。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HonestyGuard, QUALITATIVE_PATTERNS } from '../src/index.js';

// ─── lint：每層 ≥2 正例（放行）＋ 2 反例（違規；L0 無禁用模式，反例改驗證
//     「L1/L2 會違規的同句在 L0 放行」，此即 L0 允許「你是」的規格點）──────

test('lint L0：允許「你是」等定性斷言（含 TASKS.md 指定案例）', () => {
  // 正例：一般 L0 描述
  assert.equal(HonestyGuard.lint('日主為癸水，五行以火最多', 'L0').ok, true);
  assert.equal(HonestyGuard.lint('命宮主星亮度為旺', 'L0').ok, true);
  // 對照例：同樣文字在 L2 違規、在 L0 放行
  assert.equal(HonestyGuard.lint('你是七殺坐命', 'L0').ok, true);
  assert.equal(HonestyGuard.lint('你天生帶正印，注定與學習有緣', 'L0').ok, true);
  assert.equal(HonestyGuard.lint('你是七殺坐命', 'L2').ok, false);
});

test('lint L1：定性斷言違規、時期語氣放行', () => {
  // 反例（違規）
  const bad1 = HonestyGuard.lint('這十年你是掌權者', 'L1');
  assert.equal(bad1.ok, false);
  assert.ok(bad1.problems.length >= 1);
  const bad2 = HonestyGuard.lint('這步大運注定辛苦', 'L1');
  assert.equal(bad2.ok, false);
  // 正例（放行）
  assert.equal(HonestyGuard.lint('這段時期你會偏向主動開拓', 'L1').ok, true);
  assert.equal(HonestyGuard.lint('此十年火的佔比明顯上升', 'L1').ok, true);
});

test('lint L2：定性斷言違規、年度語氣放行（含 TASKS.md 指定案例）', () => {
  // 反例（違規）
  const bad1 = HonestyGuard.lint('這段時期你是領導者', 'L2');
  assert.equal(bad1.ok, false);
  assert.ok(bad1.problems.some(p => p.includes('L2') && p.includes('你是')));
  assert.equal(HonestyGuard.lint('今年你永遠不缺機會', 'L2').ok, false);
  // 正例（放行）
  assert.equal(HonestyGuard.lint('今年你會遇到較多變動', 'L2').ok, true);
  assert.equal(HonestyGuard.lint('這段時間流年干支為丙午', 'L2').ok, true);
});

test('lint L3：定性斷言違規、情境語氣放行', () => {
  // 反例（違規）
  assert.equal(HonestyGuard.lint('在衝突當下你是強勢的一方', 'L3').ok, false);
  assert.equal(HonestyGuard.lint('在職場你天生壓得住場面', 'L3').ok, false);
  // 正例（放行）
  assert.equal(HonestyGuard.lint('在初識場合你會傾向先觀察', 'L3').ok, true);
  assert.equal(HonestyGuard.lint('在壓力低谷情境下你會傾向獨處', 'L3').ok, true);
});

test('lint：空值與非字串視為無違規；問題訊息帶實際分層', () => {
  assert.deepEqual(HonestyGuard.lint('', 'L2'), { ok: true, problems: [] });
  assert.deepEqual(HonestyGuard.lint(undefined, 'L3'), { ok: true, problems: [] });
  const multi = HonestyGuard.lint('你是注定永遠的領導者', 'L3');
  assert.equal(multi.ok, false);
  assert.equal(multi.problems.length, 3);
  for (const p of multi.problems) assert.ok(p.startsWith('L3 '));
});

// ─── 模式表可擴充且匯出 ─────────────────────────────────────────────────────

test('QUALITATIVE_PATTERNS 匯出且每項欄位齊全', () => {
  assert.ok(Array.isArray(QUALITATIVE_PATTERNS) && QUALITATIVE_PATTERNS.length >= 4);
  const ids = QUALITATIVE_PATTERNS.map(p => p.id);
  for (const required of ['ni-shi', 'ni-tian-sheng', 'zhu-ding', 'yong-yuan']) {
    assert.ok(ids.includes(required), `缺少模式 ${required}`);
  }
  for (const p of QUALITATIVE_PATTERNS) {
    assert.ok(p.pattern instanceof RegExp, `${p.id} pattern 非 RegExp`);
    assert.ok(Array.isArray(p.layers) && p.layers.length > 0);
    assert.ok(typeof p.problem === 'string' && p.problem.length > 0);
  }
});

test('模式表可擴充：push 新模式後 lint 立即生效', () => {
  QUALITATIVE_PATTERNS.push({
    id: 'test-only',
    pattern: /測試專用禁語/,
    layers: ['L2'],
    problem: '{layer} 內容使用了測試專用禁語',
  });
  try {
    assert.equal(HonestyGuard.lint('這句含測試專用禁語', 'L2').ok, false);
    assert.equal(HonestyGuard.lint('這句含測試專用禁語', 'L1').ok, true);
  } finally {
    QUALITATIVE_PATTERNS.pop();
  }
  assert.equal(HonestyGuard.lint('這句含測試專用禁語', 'L2').ok, true);
});

// ─── auditReport ────────────────────────────────────────────────────────────

/** 空殼 Report（與 analyze() 的 G/H 空殼同形狀）。 */
function emptyShellReport() {
  return {
    stateTable: { scenarios: [], pending: true },
    evolution: { periods: [], narrative: '', pending: true },
    honesty: { languageRules: [], violations: [], pending: true },
  };
}

test('auditReport：空殼 Report 回傳 []', () => {
  assert.deepEqual(HonestyGuard.auditReport(emptyShellReport()), []);
});

test('auditReport：掃出三個掃描點的違規，Violation 四欄齊全', () => {
  const report = emptyShellReport();
  report.stateTable.scenarios = [
    {
      id: 'workplace',
      name: '工作場域',
      insufficientData: false,
      cells: [
        { sources: [{ system: 'bazi', componentId: 'tenGodsContext', name: '官殺' }], expression: '在工作場域你是天生的主管', hypothesis: true },
        { sources: [{ system: 'ziwei', componentId: 'soulVsBody', name: '命身' }], expression: '在工作場域你會傾向先建立規則', hypothesis: true },
      ],
    },
  ];
  report.evolution.periods = [
    { system: 'bazi', label: '2024–2033 甲辰大運', range: [2024, 2033], summary: ['這步大運注定順遂', '此十年木的佔比上升'] },
  ];
  report.evolution.narrative = '整體而言你永遠走在上升軌道';

  const violations = HonestyGuard.auditReport(report);
  assert.equal(violations.length, 3);
  for (const v of violations) {
    assert.deepEqual(Object.keys(v).sort(), ['layer', 'location', 'problem', 'text']);
    assert.ok(['L0', 'L1', 'L2', 'L3'].includes(v.layer));
    assert.ok(v.location.length > 0 && v.text.length > 0 && v.problem.length > 0);
  }

  const cellViolation = violations.find(v => v.location === 'stateTable.scenarios[0].cells[0]');
  assert.ok(cellViolation, '缺 stateTable cell 違規');
  assert.equal(cellViolation.layer, 'L3');
  assert.equal(cellViolation.text, '在工作場域你是天生的主管');

  const summaryViolation = violations.find(v => v.location === 'evolution.periods[0].summary[0]');
  assert.ok(summaryViolation, '缺 evolution summary 違規');
  assert.equal(summaryViolation.layer, 'L1');

  const narrativeViolation = violations.find(v => v.location === 'evolution.narrative');
  assert.ok(narrativeViolation, '缺 evolution narrative 違規');
  assert.equal(narrativeViolation.layer, 'L1');
});

test('auditReport：內容乾淨時回傳 []', () => {
  const report = emptyShellReport();
  report.stateTable.scenarios = [
    { id: 'conflict', name: '衝突當下', insufficientData: false, cells: [
      { sources: [{ system: 'ziwei', componentId: 'sanFangSiZheng', name: '三方四正' }], expression: '在衝突當下你會傾向據理力爭', hypothesis: true },
    ] },
  ];
  report.evolution.periods = [
    { system: 'ziwei', label: '36–45 大限', range: [2026, 2035], summary: ['這段時期你會偏向穩健經營', '此大限官祿宮強度上升'] },
  ];
  report.evolution.narrative = '各時期五行佔比呈緩慢輪動';
  assert.deepEqual(HonestyGuard.auditReport(report), []);
});
