# 歷史文件 archive

## 歸檔界線

這裡保存已被後續實作或決策取代的規劃文件。**歸檔不表示需求取消，也不使歷史驗收證據失效。** 文件中的舊指令、路徑、schema、版本、限制與待辦是當時的記錄，不是要求重跑的新任務。

現行工作從[文件索引](../README.md)、[ROADMAPS](../../ROADMAPS.md)、[CONTRIBUTING](../CONTRIBUTING.md) 與 [GitHub Issues](https://github.com/skydreamer0/fortunetelling/issues) 進入。架構演進與 ADR 留在 [ARCHITECTURE](../ARCHITECTURE.md)、[ARCHITECTURE-V2](../ARCHITECTURE-V2.md)、[DECISIONS](../DECISIONS.md)；不任意改編號或刪除舊決策。

## 2026-07 v1 規劃包

歸檔日期：2026-10-09。來源基準：`master` [0df54d1be339f805900ff7c9faeb2df759b67b25](https://github.com/skydreamer0/fortunetelling/commit/0df54d1be339f805900ff7c9faeb2df759b67b25)。來源 commit 連結保存搬移前的完整原文，以下列出原始路徑與新位置。

| 原始路徑／原文 | archive 位置 | 歸檔理由與目前參照 |
|---|---|---|
| [docs/TASKS.md](https://github.com/skydreamer0/fortunetelling/blob/0df54d1be339f805900ff7c9faeb2df759b67b25/docs/TASKS.md) | [TASKS.md](2026-07-v1/TASKS.md) | v1 B1–D5 已完成，見 [HISTORY 附錄](../HISTORY.md)；進度改由 [Issue](https://github.com/skydreamer0/fortunetelling/issues) 管理 |
| [docs/HARNESS_SPEC.md](https://github.com/skydreamer0/fortunetelling/blob/0df54d1be339f805900ff7c9faeb2df759b67b25/docs/HARNESS_SPEC.md) | [HARNESS_SPEC.md](2026-07-v1/HARNESS_SPEC.md) | 專供舊 TASKS 的執行規則，含 Schema v1 與舊交付限制；現行入口為 [CONTRIBUTING](../CONTRIBUTING.md)、[專案規則](../../.agents/AGENTS.md) 與當次任務授權 |
| [docs/PLAN-FOR-AUDIT.md](https://github.com/skydreamer0/fortunetelling/blob/0df54d1be339f805900ff7c9faeb2df759b67b25/docs/PLAN-FOR-AUDIT.md) | [PLAN-FOR-AUDIT.md](2026-07-v1/PLAN-FOR-AUDIT.md) | 2026-07-11 v1 審計計畫；系統子集、JSDoc、無星曆／Vanilla UI 等前提分別由 D-022、D-024、D-027、D-030 修訂，runtime 見 D-025 |
| [docs/plans/2026-07-11-b1-bazi-engine-design.md](https://github.com/skydreamer0/fortunetelling/blob/0df54d1be339f805900ff7c9faeb2df759b67b25/docs/plans/2026-07-11-b1-bazi-engine-design.md) | [B1 設計](2026-07-v1/plans/2026-07-11-b1-bazi-engine-design.md) | B1 已完成；舊固定 Asia/Taipei 限制已由 V1 時間層演進，見 HISTORY 與 D-026／D-032 |
| [docs/plans/2026-07-11-b1-bazi-engine-plan.md](https://github.com/skydreamer0/fortunetelling/blob/0df54d1be339f805900ff7c9faeb2df759b67b25/docs/plans/2026-07-11-b1-bazi-engine-plan.md) | [B1 執行計畫](2026-07-v1/plans/2026-07-11-b1-bazi-engine-plan.md) | 同一已完成 B1 工作包；保留當時逐步實作與測試方式 |
| [docs/plans/2026-07-11-b2-bazi-periods-design.md](https://github.com/skydreamer0/fortunetelling/blob/0df54d1be339f805900ff7c9faeb2df759b67b25/docs/plans/2026-07-11-b2-bazi-periods-design.md) | [B2 設計](2026-07-v1/plans/2026-07-11-b2-bazi-periods-design.md) | B2 已完成，見 HISTORY；目前 Timeline 有效時間契約須再讀 D-040／D-052，不能用舊設計替代 |
| [docs/plans/2026-07-11-b3-bazi-ten-gods-plan.md](https://github.com/skydreamer0/fortunetelling/blob/0df54d1be339f805900ff7c9faeb2df759b67b25/docs/plans/2026-07-11-b3-bazi-ten-gods-plan.md) | [B3 計畫](2026-07-v1/plans/2026-07-11-b3-bazi-ten-gods-plan.md) | B3 已完成；D-018 的決策與原始驗收依據繼續保留 |
| [docs/plans/2026-07-11-bcd-task-delivery-design.md](https://github.com/skydreamer0/fortunetelling/blob/0df54d1be339f805900ff7c9faeb2df759b67b25/docs/plans/2026-07-11-bcd-task-delivery-design.md) | [B/C/D 交付設計](2026-07-v1/plans/2026-07-11-bcd-task-delivery-design.md) | 對應已完成 11 個 v1 任務的依賴／落地順序；不套用到後續 Issue |

### 原文保存方式

- 8 份文件的內容保留；只修正 TASKS 與 PLAN-FOR-AUDIT 合計 4 個因搬移而失效的相對 Markdown 連結。其餘 6 檔逐位元保持原樣。
- 舊程式碼片段、命令及純文字來源路徑仍保留原文；不能把它們當現在的 checkout 路徑。原始 `docs/TASKS.md`、`docs/HARNESS_SPEC.md`、`docs/PLAN-FOR-AUDIT.md` 留有短導覽頁，保留舊引用的入口。
- 尤其 `packages/core/tests/fixtures/integrationCases.ts` 引用的 `docs/TASKS.md` 是歷史 golden 向量出處；fixture 與來源文字沒有為這次文件整理而改寫。
- 檔案以內容時期分組；資料夾名稱不是新的 ADR 編號、版本宣告或驗收結論。

### 本批不歸檔的項目

- [兩份 cross-validation／CI／Pages 計畫](../README.md)：完成與未完成項混雜，保留原位待逐項核對。
- [db 草案](../db/README.md)：暫停不等於取消，不以過時為由搬走。
- [validation](../validation)、核心／AI fixtures、所有 golden 與歷史 delta：驗收與研究原始資料維持原位；`LOCKED FORECAST V1` 與既有預測不讀取、不重算、不改寫。
- 現行架構與 ADR 仍有待對齊內容，由相關 Issue 追蹤；本批不將 #49、#51 等未完成契約標為已完成。
