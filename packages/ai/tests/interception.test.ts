/**
 * V5 completion criterion: model output that re-derives charts, cites nothing,
 * fakes citations, or uses fatalistic L0 wording for time-varying content is
 * intercepted by the PROGRAM, with reasons; a valid cited section survives.
 */
import { describe, expect, test } from 'bun:test';
import { interpret, createMemoryStore } from '../src/client';
import { buildInterpretationPayload } from '../src/payload';
import { validateSections } from '../src/validate';
import { buildCorpus, SEXAGENARY, ZIWEI_MINOR_STARS } from '../src/vocab';
import { loadQuestion, loadReport, mockComplete } from './helpers';

const report = loadReport();
const built = buildInterpretationPayload(report, { question: loadQuestion() });
const corpus = buildCorpus(built.payloadJson, built.payload);
const inPayload = (t: string) => built.payloadJson.includes(t) || corpus.extra.has(t);

// Pick facts that are / are not in this payload, so the test does not hard-code chart data.
const wrongGanzhi = SEXAGENARY.find((gz) => !inPayload(gz))!;
const madeUpStar = ZIWEI_MINOR_STARS.find((s) => !inPayload(s))!;
const s0 = built.payload.signals.find((s) => s.system === 'bazi')!;
const s1 = built.payload.signals.find((s) => s.system === 'ziwei')!;
const presentGanzhi = SEXAGENARY.find((gz) => built.payloadJson.includes(gz))!;

const valid = {
  heading: '這段時期的變動',
  text: `${presentGanzhi} 相關訊號顯示，這段時期在移動與財務上可能出現調整；八字與紫微的方向並不一致，建議分開看待。`,
  citations: [s0.id, s1.id],
};

const bad = {
  wrongGanzhi: {
    heading: '流年重點',
    text: `今年是${wrongGanzhi}年，這段時期可能較忙碌。`,
    citations: [s0.id],
  },
  madeUpStar: { heading: '星曜', text: `命宮有${madeUpStar}坐守，這段時期人緣可能不錯。`, citations: [s1.id] },
  uncited: { heading: '總結', text: '這段時期整體平穩。', citations: [] as string[] },
  fakeCitation: { heading: '事業', text: '這段時期工作上可能有新機會。', citations: ['sig_0000000000000000'] },
  fatalistic: { heading: '個性', text: '你是勞碌命，你天生就要辛苦，注定如此。', citations: [s0.id] },
  fakeConsensus: { heading: '共識', text: '三套系統高共識指出這段時期適合行動。', citations: [s0.id] },
  nakshatra: { heading: '月宿', text: '你的月亮落在 Rohini，這段時期情感較豐沛。', citations: [s0.id] },
  malformed: { heading: 1, text: null },
};

describe('post-validation interception (V5-04)', () => {
  test('fixtures are meaningful', () => {
    expect(wrongGanzhi).toBeDefined();
    expect(madeUpStar).toBeDefined();
    expect(presentGanzhi).toBeDefined();
  });

  test('every bad section is dropped with the right reason; the valid one survives', () => {
    const { kept, dropped } = validateSections([valid, ...Object.values(bad)], {
      payload: built.payload,
      payloadJson: built.payloadJson,
    });
    expect(kept).toEqual([valid]);
    expect(dropped).toHaveLength(Object.keys(bad).length);

    const reasonsOf = (s: unknown) => dropped.find((d) => d.section === s)!.reasons;
    expect(reasonsOf(bad.wrongGanzhi)).toContainEqual(
      expect.objectContaining({ code: 'unverified_term', kind: 'ganzhi', value: wrongGanzhi }),
    );
    expect(reasonsOf(bad.madeUpStar)).toContainEqual(
      expect.objectContaining({ code: 'unverified_term', kind: 'star', value: madeUpStar }),
    );
    expect(reasonsOf(bad.uncited).map((r) => r.code)).toEqual(['no_citations']);
    expect(reasonsOf(bad.fakeCitation)).toContainEqual(
      expect.objectContaining({ code: 'unknown_citation', value: 'sig_0000000000000000' }),
    );
    const fatal = reasonsOf(bad.fatalistic);
    expect(fatal.filter((r) => r.code === 'honesty').map((r) => r.detail)).toEqual(
      expect.arrayContaining(['L2 內容使用了「你是」定性語氣', 'L2 內容使用了「你天生」定性語氣', 'L2 內容使用了「注定」宿命斷言']),
    );
    expect(reasonsOf(bad.fakeConsensus).map((r) => r.code)).toContain('high_consensus_unsupported');
    expect(reasonsOf(bad.nakshatra)).toContainEqual(
      expect.objectContaining({ code: 'unverified_term', kind: 'nakshatra', value: 'Rohini' }),
    );
    expect(reasonsOf(bad.malformed).map((r) => r.code)).toEqual(['malformed']);
  });

  test('palace names: 「…宮」 accepted when the bare form is in the chart; absent palace rejected', () => {
    const ok = { heading: '財帛', text: '財帛宮相關訊號在這段時期偏活躍。', citations: [s1.id] };
    const r = validateSections([ok], { payload: built.payload, payloadJson: built.payloadJson });
    expect(r.kept).toHaveLength(1);
    // Remove charts → same prose must now be rejected (anti re-derivation).
    const bare = buildInterpretationPayload(
      { ...report, engines: [], timeline: null, signals: report.signals!.filter((s) => s.system === 'numerology') },
      { maxChars: 10_000_000 },
    );
    const text = '財帛宮有化忌，這段時期要留意。';
    const r2 = validateSections([{ heading: 'x', text, citations: [bare.payload.signals[0].id] }], {
      payload: bare.payload,
      payloadJson: bare.payloadJson,
    });
    expect(r2.dropped[0].reasons.some((x) => x.code === 'unverified_term' && x.value === '財帛宮')).toBe(true);
  });

  test('「高共識」 allowed when citations span ≥ 3 systems', () => {
    const systems = new Map<string, string>();
    for (const s of built.payload.signals) if (!systems.has(s.system)) systems.set(s.system, s.id);
    expect(systems.size).toBeGreaterThanOrEqual(3);
    const section = { heading: '共識', text: '多套系統在這段時期呈現高共識的變動傾向。', citations: [...systems.values()].slice(0, 3) };
    const r = validateSections([section], { payload: built.payload, payloadJson: built.payloadJson });
    expect(r.kept).toHaveLength(1);
  });

  test('end-to-end through interpret(): dropped sections reported, kept sections returned', async () => {
    const output = JSON.stringify({ sections: [valid, ...Object.values(bad)] });
    const { fn } = mockComplete([output]);
    const result = await interpret(report, { complete: fn, question: loadQuestion(), store: createMemoryStore() });
    expect(result.sections).toEqual([valid]);
    expect(result.dropped).toHaveLength(Object.keys(bad).length);
    expect(result.question).toEqual({ category: 'vehicle_purchase', unsupported: false });
  });
});
