/**
 * @fileoverview 匯出包 README.md（給 AI 看的欄位說明）。純函式，內文不含時間戳。
 * @module export/readme
 */

export type ReadmeInput = {
  preset: string;
  asOf: string;
  redacted: boolean;
  experimentalSystems: readonly string[];
};

export function buildExportReadme(input: ReadmeInput): string {
  const lines = [
    '# 命理綜合分析匯出包',
    '',
    `- 預設（preset）：\`${input.preset}\``,
    `- 評估日期（asOf）：${input.asOf}`,
    `- 去識別化：${input.redacted ? '是（已移除姓名與出生地標籤；資料中若出現 `[name]`、`[place]` 為佔位符）' : '否（含完整個人資料，請勿隨意分享）'}`,
    '',
    '## 檔案',
    '',
    '| 檔案 | 內容 |',
    '|---|---|',
    '| `manifest.json` | 版本（核心、profile schema、規則與 catalog）、asOf、參與與略過的系統、星曆狀態、各檔指紋 |',
    '| `profile.json` | 出生資料（`profileId` 為穩定代號；`chartFingerprint` 為命盤內容雜湊） |',
    '| `chart.json` | 七個系統的本命盤、components 與 warnings；出生時間未知時需要時間的系統為 `available: false` |',
    '| `signals.json` | 全部訊號（`id` 為內容雜湊，可被引用）：`system`、`domain`、`window`、強度與依據 |',
    '| `timeline.json` | 年、月格子的各領域分數、等級、共識、矛盾；`topSignalIds` 對應 `signals.json` 的 `id` |',
    '| `consensus.json` | 跨系統共識與矛盾摘要（`headlines.agreements`／`headlines.conflicts`） |',
    '',
    '## 哪些是確定性計算',
    '',
    '- 命盤、訊號、時間軸、共識全部由程式依規則算出，同一份 profile、asOf 與版本會得到完全相同的結果。',
    '- 不含任何 AI 生成內容；你（AI）不需要也不應該重新排盤。',
    '',
    '## 哪些分數未校準',
    '',
    '- 各領域 `score`（0–100）與 `band` 是規則加總後的相對指標，**尚未用真實人生事件校準**，不是機率，也不可跨系統當作等量信心。',
    '- 系統權重與等級切點是預設值，尚待多人回驗資料才會調整。',
    ...(input.experimentalSystems.length > 0
      ? [`- 實驗中系統（尚未與公開計算器交叉驗證）：${input.experimentalSystems.map(s => `\`${s}\``).join('、')}。引用時須註明，不可與已驗證系統同等看待。`]
      : []),
    '',
    '## 建議分析步驟',
    '',
    '1. 先讀 `manifest.json`：確認 asOf、哪些系統參與、哪些被略過（例如時間未知）。',
    '2. 讀 `consensus.json`：找出多系統同向（高共識）與保留的矛盾；矛盾不要抹平。',
    '3. 需要依據時，用 `timeline.json` 的 `topSignalIds` 到 `signals.json` 查訊號，每個結論都引用 `signal.id`。',
    '4. activityAgreement只表示共同關注；高共識只認同一領域／時間窗的directionalEvidence：至少三套正權重、非experimental系統依raw值及thresholds同向。positive為同向支持、negative為同向壓力，兩側達標都保留；舊報告缺證據不得回填成高共識。',
    '5. 不要說宿命論式的斷言；用「傾向」「這段期間較適合」等語氣，並說明不確定性。',
    '',
  ];
  return lines.join('\n');
}
