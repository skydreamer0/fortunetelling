/**
 * lunar-javascript 未附型別宣告；以 any 宣告，讓 TS 模組在 core 與 apps/web 的型別檢查下都能匯入。
 * 時間層只用到 Solar／Lunar／LunarYear，呼叫端自行把結果轉成強型別。
 */
declare module 'lunar-javascript';
