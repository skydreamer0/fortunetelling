import { checkAnswer, questionContextOf } from '@fortune/ai/mcp';
import { z } from 'zod';
import { questionModelIdentityV4 } from '@fortune/core';
import { ToolError } from '../errors';
import { caveatsFor, ok } from '../envelope';
import { defineTool } from './types';
import { computeQuestionContext, computeQuestionContextV4 } from './questions';
import { systemsInput, verifiedOnlyInput } from '../systems';

/** 貼回的回答長度上限（字元），避免把整段對話倒進來。 */
export const MAX_ANSWER_CHARS = 20_000;

export const answerCheckTools = [
  defineTool({
    name: 'check_answer',
    description:
      '檢查一段 AI 回答（可貼別的 AI 的回答，或你自己寫好的草稿）是否守規矩，結果只標示、不改寫。以空行分段，檢查：' +
      '(a) 引用的 sig_ id 是否都存在（對照 profileId 與 asOf 算出的訊號；短編號 sig_+8 位、完整編號、>=8 位前綴、大小寫不分都可解析，前綴對到多筆視為查不到）；' +
      '(b) 是否有宿命論或保證式用語（你是／注定／一定會／絕對／保證／確定發生／大吉／大凶等）；' +
      '(c) 「高共識」是否有同一領域／時間窗至少3套正權重、非experimental系統的同向raw計算證據。共同關注不等於高共識；缺證據只表示無法確認。' +
      '(d) 問事回答須原樣帶回 answer_question 的 questionContext（類別、範圍、systems/verifiedOnly）；用相同 profileId/asOf 重算狀態。不排名仍推薦月份會報錯；缺 context 的月份推薦標為無法核對。' +
      '回傳 { ok, paragraphCount, citedIds, unknownCitations, issues[] }；每個 issue 有 code、paragraph（從 0 起算）、values、detail、excerpt。' +
      '不檢查回答是否「算對」，只檢查引用與語氣。',
    input: {
      profileId: z.string(),
      asOf: z.string().describe("Evaluation date 'YYYY-MM-DD'；須與產生該回答時查詢用的 asOf 相同，否則 id 可能對不上。"),
      answerText: z.string().min(1).max(MAX_ANSWER_CHARS).describe(`要檢查的回答全文（最多 ${MAX_ANSWER_CHARS} 字）。`),
      questionContext: z.object({
        answerVersion: z.literal(4).optional(),
        modelVersion: z.literal('question-v4-diagnostic-1').optional(),
        modelFingerprint: z.string().optional(),
        category: z.string(),
        range: z.object({ start: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), end: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).strict(),
        systems: systemsInput,
        verifiedOnly: verifiedOnlyInput,
      }).strict().optional(),
    },
    async handler(args, { analyzer }) {
      const analysis = await analyzer.get(args.profileId, args.asOf);
      const q = args.questionContext;
      if (q && (q.answerVersion !== undefined || q.modelVersion !== undefined || q.modelFingerprint !== undefined) &&
          (q.answerVersion !== 4 || q.modelVersion !== questionModelIdentityV4().modelVersion || q.modelFingerprint !== questionModelIdentityV4().fingerprint)) {
        throw new ToolError('invalid_args', 'Question v4 requires exact version and fingerprint; no legacy fallback');
      }
      const questionContext = q?.answerVersion === 4 ? questionContextOf(computeQuestionContextV4(analysis, q.category, q.range, q.systems, q.verifiedOnly)) : q ? questionContextOf(computeQuestionContext(analysis, q.category, q.range, q.systems, q.verifiedOnly)) : null;
      const result = checkAnswer(args.answerText, { questionContext, signalLookup: id => analysis.findSignal(id), directionalEvidence: () => analysis.directionalEvidence() });
      return ok({ calculation: analysis.calculation, asOf: analysis.asOf, ...(q?.answerVersion === 4 ? { questionVersion: 4 as const } : {}), data: result, caveats: caveatsFor(analysis) });
    },
  }),
];


/** V4 clients cannot silently fall back by omitting model metadata. Historical check_answer remains readable. */
export const answerCheckV4Tools = [defineTool({
  ...answerCheckTools[0],
  name: 'check_answer_v4',
  description: 'Check a Question v4 answer using the exact returned questionContext. Version and model fingerprint are required; missing or unknown versions are rejected, never recalculated with v3.',
  input: { ...answerCheckTools[0].input, questionContext: answerCheckTools[0].input.questionContext.unwrap().extend({
    answerVersion: z.literal(4), modelVersion: z.literal('question-v4-diagnostic-1'), modelFingerprint: z.string(),
  }).strict() },
})];
