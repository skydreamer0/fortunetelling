# Cross-validation、CI 與 GitHub Pages 設計

## 目標

為公開 GitHub 專案建立可重現的跨系統整合測試、pull request CI，以及通過驗證後自動發布 GitHub Pages 的流程。流程不產生 patch，也不自動建立修正 PR。

## 邊界

- 核心命理計算仍由既有 `analyze()` 與引擎負責。
- 測試必須固定 `asOf`、時區假設與輸入，禁止依賴執行當天日期。
- 公開 fixture 不含私人出生資料、密鑰或未授權個資。
- 公開人物案例只驗證可重算的結構與數值；命理解讀不宣稱為客觀事實。
- GitHub Pages 只部署 `main`，pull request 不部署 production。

## 方案選擇

採用兩個 workflows：

1. `ci.yml` 在 pull request 與 `main` push 執行安裝、測試及 production build。
2. `deploy-pages.yml` 在 `main` push 或手動觸發時重新驗證、建置、上傳 `dist`，再部署 Pages。

相較單一 workflow，這能讓 PR 驗證與 production 權限清楚分離；相較 reusable workflow，現階段檔案少，不需要額外抽象。

## 測試資料架構

新增版本化 fixture，分為兩類：

- `golden`：既有 1986、1991 黃金向量，鎖定已由套件與公式覆核的結果。
- `public-reference`：公開人物案例，包含資料來源 URL、可信度、出生時間精度與可驗證欄位。

整合測試由 `analyze()` 公開 API 進入，逐案檢查：

- Report Schema v1 頂層欄位不變。
- 所有引擎結果可預期，錯誤只允許 fixture 明列的可接受情況。
- radar ruleId 可解析、五行占比與時期雷達可重算。
- stateTable、evolution、honesty 完整且沒有未預期違規。
- 重複執行同一 fixture 時，排除 `generatedAt` 後結果相同。

來源不足或出生時間不確定的案例，不對依賴時辰的欄位建立黃金斷言。

## Node 與套件管理

- 公開自動化統一使用 Node 22。
- 產生並提交 `package-lock.json`，CI 使用 `npm ci`。
- `package.json` 增加 Node engine 與 `check` script。
- `check` 依序執行完整測試與 production build。

## CI workflow

`ci.yml`：

- 觸發：`pull_request`、push 到 `main`、手動執行。
- 權限：`contents: read`。
- 步驟：checkout、setup-node（npm cache）、`npm ci`、`npm test`、`npm run build`。
- 設定 timeout，避免 runner 無限等待。
- 不讀 secrets、不使用 `pull_request_target`。

## Pages workflow

`deploy-pages.yml`：

- 觸發：push 到 `main` 與 `workflow_dispatch`。
- build job 使用 `contents: read`，重新執行 `npm ci`、測試與 build。
- 以 `configure-pages` 設定 Pages，`upload-pages-artifact` 上傳 `dist`。
- deploy job 依賴 build，使用 `pages: write`、`id-token: write` 與 `github-pages` environment。
- concurrency 取消舊的進行中部署，避免舊 artifact 覆蓋新版。
- Vite 使用 GitHub Pages base path；本機開發維持 `/`。

## 依賴維護與公開專案安全

新增 `.github/dependabot.yml`：

- npm dependencies 每週檢查。
- GitHub Actions 每週檢查，directory 使用 `/`。
- 限制同時開啟的更新 PR 數量，避免公開專案被更新噪音淹沒。

README 補上 CI badge、Pages 設定步驟與本機驗證命令；`SECURITY.md` 說明不要在公開 issue 提交私人出生資料或安全敏感資訊。

## 失敗處理

- fixture 缺來源或資料矛盾：標記為不確定並縮小斷言，不猜測缺失資料。
- CI 測試失敗：阻止合併與部署，不產生 patch。
- Pages build 或 deploy 失敗：保留前一版網站，從 Actions log 診斷。
- bundle 大小警告目前不阻止部署；另記錄為後續效能工作，不混入驗證基線。

## 驗收

- 本機 `npm ci`、`npm run check` 成功。
- 整合 fixture 全數通過，輸出具可重現性。
- workflow YAML 可解析，權限符合最小權限原則。
- PR 只執行 CI；`main` 通過後可發布 `dist` 至 GitHub Pages。
- repository 設為公開後不會洩漏私人 fixture、token 或本機檔案。

## 官方依據

- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Dependabot for GitHub Actions](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/auto-update-actions)
