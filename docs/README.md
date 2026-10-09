# 文件索引

本索引區分現行入口、待核對規劃與歷史資料。文件年份本身不是歸檔依據；只有已完成或被後續決策取代的規劃才收進 [archive](archive/README.md)。

## 從哪裡開始

| 目的 | 入口 | 使用邊界 |
|---|---|---|
| 安裝、操作與本機 MCP | [專案 README](../README.md)、[MCP-SETUP](MCP-SETUP.md) | 操作指南；本機計算不代表工具結果不會進入 AI 對話 |
| 進行中任務、優先序與驗收條件 | [ROADMAPS](../ROADMAPS.md)、[GitHub Issues](https://github.com/skydreamer0/fortunetelling/issues) | Issue 是進度來源，不能用舊規劃中的勾選狀態代替 |
| 開發與有效時間設定 | [CONTRIBUTING](CONTRIBUTING.md)、[專案執行規則](../.agents/AGENTS.md) | 依任務授權範圍工作；runtime、套件管理與測試使用 Bun |
| 架構與介面演進 | [ARCHITECTURE](ARCHITECTURE.md)、[ARCHITECTURE-V2](ARCHITECTURE-V2.md) | 混有歷史 schema 與藍圖片段，須連同後續 ADR、目前公開型別與測試閱讀 |
| 設計決策、取代關係與限制 | [DECISIONS](DECISIONS.md) | ADR 編號與原決策保留；後續決策可以修訂舊決策，不能把單一舊段落當成目前完整契約 |
| 完成里程碑與實作紀錄 | [HISTORY](HISTORY.md) | 歷史證據，不再更新進度；文中當時的版本與待辦不能當成目前狀態 |
| 已取代的 v1 任務／規劃 | [archive 索引](archive/README.md) | 保留原文、來源與取代依據，不作為新任務的執行指示 |

## 本次整理核對點

文件盤點基準為 `master` [0df54d1b](https://github.com/skydreamer0/fortunetelling/commit/0df54d1be339f805900ff7c9faeb2df759b67b25)（2026-10-09）。這是一次歸檔盤點，不取代即時 Issue／PR 狀態。

- `@fortune/core` 為 0.8.0；D-052 已收緊 Timeline／Backtest 的有效時間選項。Report7／Timeline2／Consensus2／BacktestTimeline1／Profile1 形狀未因該切片改變。以 [core package](../packages/core/package.json)、[D-052 所在 ADR](DECISIONS.md) 與 [CONTRIBUTING](CONTRIBUTING.md) 的契約說明核對；0.7.0 是前一切片的歷史版本。
- #51 的 ChartSnapshot、snapshotId／姓名關係與 Report 下一版相容策略仍有後續工作；歸檔 v1 規劃不代表它們已交付。
- [#19／#46 驗收紀錄](validation/answer-check-19-46.md) 是 Bun 真引擎診斷與待完成的瀏覽器步驟，不能當成桌機／手機瀏覽器驗收已完成。
- [#49](https://github.com/skydreamer0/fortunetelling/issues/49) 等現行文件修正另行追蹤；本次只收攏舊規劃與修復導覽，不校準模型、重寫 ADR 結論或宣布未完成需求過時。

## 保留原位的規劃與證據

### 規劃：先核對，不能因日期舊就歸檔

- [Cross-validation／CI／Pages 設計](plans/2026-07-11-cross-validation-ci-pages-design.md)
- [Cross-validation／CI／Pages 執行計畫](plans/2026-07-11-cross-validation-ci-pages-plan.md)

這兩份保留原文，因為已實作的 CI／Pages 與尚待確認的維護、公開專案安全項目混在一起；不能將整份標成「已完成」或「已取消」。其中 `main`、Node runner、舊指令／目錄是原規劃語境，不能直接當現行操作手冊。現行驗證入口見 [README](../README.md) 與 [CI workflow](../.github/workflows/ci.yml)；部署 workflow 另見 [deploy.yml](../.github/workflows/deploy.yml)。整理文件不授權修改或觸發工作流程。

- [資料層草案](db/README.md) 與 [schema.sql](db/schema.sql)：資料庫／帳號同步仍依 [ROADMAPS](../ROADMAPS.md) 與 #22 追蹤暫停狀態；保留設計不表示已正式上線，也不表示需求取消。
- [AI 套件說明](../packages/ai/README.md)、[設計系統](../design-system/fortune-telling-platform/MASTER.md)：保留在所屬套件／設計目錄。

### 驗收與研究來源：不移動、不改寫

- [共識驗證 #43／#44](validation/consensus-4344.md)
- [問事 abstention 驗證 #45](validation/question-abstention-45.md)
- [AnswerCheck #19／#46](validation/answer-check-19-46.md) 與[原始 Bun 結果](validation/answer-check-19-46.bun.json)
- [核心 golden／delta fixtures](../packages/core/tests/fixtures)、[計算器交叉驗證資料](../packages/core/tests/fixtures/validation)、[AI fixtures](../packages/ai/tests/fixtures)

`LOCKED FORECAST V1`、既有預測、golden、歷史 delta 與驗收原始結果均不因整理文件而重算、刪除或改寫。ADR 的來源與編號也維持可查。
