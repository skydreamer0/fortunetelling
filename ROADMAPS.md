# Roadmap

> **進度與待辦以 GitHub Issue 為準**，本檔只放方向、原則與連結，不複製任務表（避免兩邊不同步）。
> 已完成的里程碑（V0–V5、M0.5～M5）與實作紀錄：[docs/HISTORY.md](docs/HISTORY.md)。
> 決策紀錄：[docs/DECISIONS.md](docs/DECISIONS.md)；架構：[docs/ARCHITECTURE-V2.md](docs/ARCHITECTURE-V2.md)；MCP 設定：[docs/MCP-SETUP.md](docs/MCP-SETUP.md)。

## 目前方向：分析模型 V2

八字、紫微優先做深，其他系統提供有能力邊界的比較視角；計算、解讀、彙整、驗證分層，所有結論可追溯、可重現。

- 執行總控：[#25 Epic](https://github.com/skydreamer0/fortunetelling/issues/25)（工作清單、相依順序、驗收門檻都在那裡）
- 相依與狀態看 Epic 的核取方塊，不在此重複。

## 暫停

- [#22](https://github.com/skydreamer0/fortunetelling/issues/22) 資料庫與帳號同步
- [#23](https://github.com/skydreamer0/fortunetelling/issues/23) 遷移 Next.js

## 維護方式

| 內容 | 放哪裡 |
|---|---|
| 進行中／待辦、優先序、相依 | GitHub Issue（Epic 加 Label） |
| 設計決策與理由 | `docs/DECISIONS.md`（ADR） |
| 已完成歷史 | `docs/HISTORY.md` |
| 願景與原則 | 本檔 |

## 核心原則

**產品形狀**：圖形介面（整理與呈現命盤資料）＋ 本機 AI 對話（下結論、討論）。
**程式先把能邏輯化的部分全部算完；AI 在你本機的對話中，經 MCP 按需查詢、比對、下結論。**

```
使用者輸入（生日／時間／出生地／性別）
  → 程式：把「能邏輯化的」全部算完
       TimeContext → Calculators → Rule Engine → Signal → 共識／矛盾 → Timeline → 問事排名
  → 兩條出口
       ① 圖形介面（網站，給人看）
       ② 本機 MCP server／匯出檔（給 Claude 桌面版查詢，給 AI 討論）
  → Claude 桌面版對話：AI 按需查詢、比對、下結論
```

1. **能確定的交給程式**：排盤、規則、訊號、共識、逐月分數。AI 不重新排盤、不心算（D-021 仍成立）。
2. **AI 負責最後一段**：跨系統比對、綜合判斷、回答問題、對話追問（D-036 修訂了舊的「AI 只讀結果」說法）。
3. **按需查詢，不一次吞下全部**：每個模組只是多一個工具；工具輸出有大小上限，過大回錯誤而不是截斷。
4. **本機優先**：不需要 API key、不需要伺服器。
5. **保留矛盾、標示不確定**：系統間方向相反就並列；分數未校準（D-033）、未驗證系統（`verified: false`，D-039）要讓 AI 知道。
6. **MCP 只包裝 core**：不自行重算第二套邏輯。
7. **隱私分兩層**（D-038）：本機 profile 保留完整資料；進入 AI 對話的工具結果姓名預設不回傳。

---
