import { checkAnswer } from '@fortune/ai/mcp';
import { z } from 'zod';
import { caveatsFor, ok } from '../envelope';
import { defineTool } from './types';

/** 貼回的回答長度上限（字元），避免把整段對話倒進來。 */
export const MAX_ANSWER_CHARS = 20_000;

export const answerCheckTools = [
  defineTool({
    name: 'check_answer',
    description:
      '檢查一段 AI 回答（可貼別的 AI 的回答，或你自己寫好的草稿）是否守規矩，結果只標示、不改寫。以空行分段，檢查：' +
      '(a) 引用的 sig_ id 是否都存在（對照 profileId 與 asOf 算出的訊號）；' +
      '(b) 是否有宿命論或保證式用語（你是／注定／一定會／絕對／保證／確定發生／大吉／大凶等）；' +
      '(c) 是否把 experimental 系統（吠陀占星 Jyotish）或只有出生盤規則的人類圖 Human Design 當成「高共識」，或寫「高共識」但引用的已驗證系統少於 3 套。' +
      '回傳 { ok, paragraphCount, citedIds, unknownCitations, issues[] }；每個 issue 有 code、paragraph（從 0 起算）、values、detail、excerpt。' +
      '不檢查回答是否「算對」，只檢查引用與語氣。',
    input: {
      profileId: z.string(),
      asOf: z.string().describe("Evaluation date 'YYYY-MM-DD'；須與產生該回答時查詢用的 asOf 相同，否則 id 可能對不上。"),
      answerText: z.string().min(1).max(MAX_ANSWER_CHARS).describe(`要檢查的回答全文（最多 ${MAX_ANSWER_CHARS} 字）。`),
    },
    async handler(args, { analyzer }) {
      const analysis = await analyzer.get(args.profileId, args.asOf);
      const result = checkAnswer(args.answerText, { signalLookup: id => analysis.findSignal(id) });
      return ok({ asOf: analysis.asOf, data: result, caveats: caveatsFor(analysis) });
    },
  }),
];
