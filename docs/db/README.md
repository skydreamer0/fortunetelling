# docs/db — V4 資料層草案

`schema.sql` 是 V4-01 的 Postgres／Supabase 資料表設計（ARCHITECTURE-V2 §10），**目前沒有在任何環境執行**：專案仍是本地優先（D-029），沒有資料庫也沒有帳號。人生事件與回驗現在只存在瀏覽器的 localStorage（`apps/web/src/lib/lifeEvents.ts`），計算在 `packages/core/src/backtest/`。

## 內容

| 表 | 用途 | 重點 |
|---|---|---|
| `users` | app 端使用者設定（帳號來自 `auth.users`） | 刪除即 cascade 全部資料 |
| `birth_profiles` | 出生資料 | 敏感：RLS、`pgp_sym_encrypt` 欄位加密（金鑰不在 DB）、經緯度只存到 0.01° |
| `chart_snapshots` | 各系統命盤快取 | `(profile, system, calculator_version, input_hash)` 唯一 |
| `signals` | 規則訊號 | 帶 `rule_version`、`weight_version`，可重現 |
| `rules`／`trait_weights`／`weight_sets` | 規則與權重 | **只增不改**：trigger 禁止 UPDATE／DELETE（D-028） |
| `annual_cycles`／`monthly_cycles` | timeline 快取 | 可隨時重算 |
| `interpretations` | AI 解讀 | 存 prompt／model 版本與 citations；送 AI 的資料去識別化 |
| `life_events` | 人生事件 | 對應 core `LifeEvent`；描述加密 |
| `backtest_runs` | 回驗紀錄 | 方法版本、種子、切分、樣本數、`樣本不足`／`可評估` |

## 上線前待辦

1. 決定金鑰管理（Supabase Vault 或 API 層環境變數）並寫 `encrypt/decrypt` 的存取函式。
2. 用兩個測試帳號實測 RLS（A 不能讀 B 的任何列）。
3. `delete_my_data()` 需在 API 層同時刪除 `auth.users`。
4. 跨使用者的匯總回驗（`backtest_runs.profile_id is null`）需另外的同意流程，只存聚合結果。
5. 權重只能經回驗、驗證集 n ≥ 30 後以新的 `weight_sets` 版本加入（core `proposeWeights`）。
