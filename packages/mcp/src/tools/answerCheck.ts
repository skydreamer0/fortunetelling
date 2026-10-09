import { checkAnswer, questionContextOf } from '@fortune/ai/mcp';
import { z } from 'zod';
import { caveatsFor, ok } from '../envelope';
import { defineTool } from './types';
import { computeQuestionContext } from './questions';
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
        category: z.string(),
        range: z.object({ start: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), end: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).strict(),
        systems: systemsInput,
        verifiedOnly: verifiedOnlyInput,
      }).strict().optional(),
    },
    async handler(args, { analyzer }) {
      const analysis = await analyzer.get(args.profileId, args.asOf);
      const q = args.questionContext;
      const questionContext = q ? questionContextOf(computeQuestionContext(analysis, q.category, q.range, q.systems, q.verifiedOnly)) : null;
      const result = checkAnswer(args.answerText, { questionContext, signalLookup: id => analysis.findSignal(id), directionalEvidence: () => analysis.directionalEvidence() });
      return ok({ asOf: analysis.asOf, data: result, caveats: caveatsFor(analysis) });
    },
  }),
];
