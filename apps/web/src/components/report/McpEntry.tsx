/**
 * 問 AI 入口一：用 Claude 桌面版討論（M4-01、M4-02）。
 *
 * 網站只做兩件事：下載 `<profileId>.fortune.json`，以及把 MCP 設定步驟寫清楚。
 * 網站不能、也不會寫入本機任意位置：檔案由使用者自己放進 `~/.fortune/profiles/`。
 * 設定步驟對應 docs/MCP-SETUP.md。
 */

import { useState } from 'react';
import { buildProfileDownload, profileIdError } from '../../lib/profileFile';
import type { Report } from '../../model/types';
import { AnswerCheck } from './AnswerCheck';
import { copyText, type CopyOutcome } from './copyText';

export type DesktopOs = 'windows' | 'mac';

export const CONFIG_PATHS: Record<DesktopOs, { label: string; path: string }[]> = {
  windows: [
    { label: '一般安裝版', path: '%APPDATA%\\Claude\\claude_desktop_config.json' },
    {
      label: 'Microsoft Store 版',
      path: '%LOCALAPPDATA%\\Packages\\Claude_*\\LocalCache\\Roaming\\Claude\\claude_desktop_config.json',
    },
  ],
  mac: [{ label: '設定檔', path: '~/Library/Application Support/Claude/claude_desktop_config.json' }],
};

export const PROFILES_DIR_LABEL: Record<DesktopOs, string> = {
  windows: '%USERPROFILE%\\.fortune\\profiles\\',
  mac: '~/.fortune/profiles/',
};

/** Config text to paste into `claude_desktop_config.json` (JSON-escaped, so Windows `\` becomes `\\`). */
export function mcpConfigSnippet(os: DesktopOs): string {
  const windows = os === 'windows';
  return JSON.stringify({
    mcpServers: {
      fortune: {
        command: 'bun',
        args: ['run', windows ? 'C:\\Users\\你\\fortunetelling\\packages\\mcp\\src\\bin.ts' : '/絕對路徑/fortunetelling/packages/mcp/src/bin.ts'],
        env: { FORTUNE_PROFILES_DIR: windows ? 'C:\\Users\\你\\.fortune\\profiles' : '/Users/你/.fortune/profiles' },
      },
    },
  }, null, 2);
}

function detectOs(): DesktopOs {
  try {
    return /Mac|iPhone|iPad/i.test(navigator.userAgent) ? 'mac' : 'windows';
  } catch {
    return 'windows';
  }
}

/** Save `text` as a file through the browser (Blob + temporary link; works in an iPhone PWA too). */
export function downloadTextFile(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const CONFIG_COPY_MESSAGES: Record<CopyOutcome, string> = {
  clipboard: '已複製設定。',
  selected: '已選取設定，請按 Ctrl+C（手機請長按選單）複製。',
  failed: '無法自動複製，請手動選取上方設定。',
};

export function McpEntry({ report, clipboard, onDownload = downloadTextFile }: {
  report: Report;
  /** Injected for tests; defaults to `navigator.clipboard`. */
  clipboard?: { writeText(value: string): Promise<void> } | null;
  /** Injected for tests; defaults to a browser download. */
  onDownload?: (filename: string, text: string) => void;
}) {
  const [os, setOs] = useState<DesktopOs>(detectOs);
  const [profileId, setProfileId] = useState('');
  const [touched, setTouched] = useState(false);
  const [downloaded, setDownloaded] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyOutcome | null>(null);

  const error = profileIdError(profileId);
  const showError = error !== null && (touched || profileId !== '');
  const snippet = mcpConfigSnippet(os);
  const idForExample = error === null ? profileId : 'sky';

  function download() {
    setTouched(true);
    const result = buildProfileDownload(report, profileId);
    if (!result.ok) return;
    onDownload(result.filename, result.text);
    setDownloaded(result.filename);
  }

  async function copyConfig() {
    setCopyState(await copyText(snippet, {
      clipboard: clipboard !== undefined ? clipboard : (typeof navigator !== 'undefined' ? navigator.clipboard : null),
      select: () => {
        const node = document.getElementById('ask-mcp-config');
        if (!node) return false;
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        return true;
      },
    }));
  }

  return (
    <details className="ask__entry ask__entry--mcp" open>
      <summary className="ask__entry-head">
        <span className="ask__entry-tag ask__entry-tag--main">建議</span>
        <span className="ask__entry-title">用 Claude 桌面版討論</span>
        <span className="ask__entry-hint">排盤與訊號由本機程式算完，Claude 只查詢與對話</span>
      </summary>

      <p className="ask__privacy" role="note">
        <strong>隱私</strong>
        下載的 .fortune.json 含出生日期、時間、出生地與姓名，只會存在你自己的電腦。
        本機 MCP 預設不會把姓名與出生資料交給 Claude，要明確要求才會提供。網站不會替你寫入任何檔案。
      </p>

      <ol className="ask__flow">
        <li className="ask__step">
          <h3 className="ask__step-title">安裝本機 MCP</h3>
          <p>
            安裝 <a href="https://bun.sh" target="_blank" rel="noreferrer">Bun</a>，在專案資料夾執行：
          </p>
          <pre className="ask__code ask__code--inline" tabIndex={0}><code>bun install</code></pre>
        </li>

        <li className="ask__step">
          <h3 className="ask__step-title">替這個人取名並下載檔案</h3>
          <div className="ask__download">
            <label className="field ask__id">
              <span className="field__label">profileId（之後問 Claude 時用的名字）</span>
              <input className="input ask__id-input" type="text" inputMode="text" value={profileId}
                maxLength={32} placeholder="例：sky" autoCapitalize="none" autoCorrect="off" autoComplete="off"
                spellCheck={false} aria-invalid={showError || undefined} aria-describedby="ask-id-help"
                onChange={event => { setProfileId(event.target.value.trim().toLowerCase()); setDownloaded(null); }}
                onBlur={() => setTouched(true)} />
            </label>
            <button type="button" className="button button--seal ask__download-button" onClick={download}
              disabled={error !== null}>
              下載 .fortune.json
            </button>
          </div>
          <p id="ask-id-help" className={showError ? 'ask__hint ask__hint--error' : 'ask__hint'} role={showError ? 'alert' : undefined}>
            {showError ? error : '小寫英文字母、數字、- 與 _，最長 32 字。檔名會是 profileId 加上 .fortune.json。'}
          </p>
          {downloaded && (
            <p className="ask__hint" role="status">
              已下載 <code>{downloaded}</code>。把它放進 <code>{PROFILES_DIR_LABEL.mac}</code>
              （Windows 是 <code>{PROFILES_DIR_LABEL.windows}</code>），資料夾不存在就自己建立。
            </p>
          )}
          {!downloaded && (
            <p className="ask__hint">
              下載後放進 <code>{PROFILES_DIR_LABEL.mac}</code>（Windows 是 <code>{PROFILES_DIR_LABEL.windows}</code>）。
              用手機的話，先下載再用 AirDrop 或檔案 App 傳到電腦。
            </p>
          )}
        </li>

        <li className="ask__step">
          <h3 className="ask__step-title">設定 Claude 桌面版</h3>
          <fieldset className="segmented ask__os">
            <legend className="field__label">你的電腦</legend>
            <div className="segmented__track">
              {([['windows', 'Windows'], ['mac', 'macOS']] as const).map(([value, label]) => (
                <label key={value} className="segmented__option">
                  <input type="radio" name="ask-os" value={value} checked={os === value}
                    onChange={() => { setOs(value); setCopyState(null); }} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <p>編輯下面的設定檔（Claude 桌面版的「設定 → 開發者 → 編輯設定」也能直接開啟）：</p>
          <ul className="ask__paths">
            {CONFIG_PATHS[os].map(item => (
              <li key={item.label}>
                <span className="ask__path-label">{item.label}</span>
                <code className="ask__path">{item.path}</code>
              </li>
            ))}
          </ul>
          {os === 'windows' && (
            <p className="ask__callout" role="note">
              從 Microsoft Store 安裝的 Claude，設定檔其實在
              <code>%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\</code>，
              不是 <code>%APPDATA%\Claude\</code>；改錯位置不會有任何作用。
            </p>
          )}

          <pre id="ask-mcp-config" className="ask__code" tabIndex={0}><code>{snippet}</code></pre>
          <div className="ask__actions">
            <button type="button" className="button button--quiet" onClick={copyConfig}>複製設定</button>
            {copyState && <span className="ask__copied" role="status">{CONFIG_COPY_MESSAGES[copyState]}</span>}
          </div>
          <ul className="ask__notes">
            <li>
              把 <code>你</code> 與 <code>{os === 'windows' ? 'C:\\\\Users\\\\你\\\\fortunetelling' : '/絕對路徑/fortunetelling'}</code> 換成你電腦上的實際位置。
              {os === 'windows' && <> JSON 裡的路徑反斜線要寫成 <code>\\</code>（兩個），單一個 <code>\</code> 會讓設定檔無法讀取。</>}
            </li>
            <li>
              找不到 <code>bun</code> 時，把 <code>command</code> 改成 {os === 'windows' ? <code>where bun</code> : <code>which bun</code>} 印出的完整路徑。
            </li>
            <li>已經有其他 <code>mcpServers</code> 的話，只加入 <code>fortune</code> 這一段。存檔後完全結束並重開 Claude 桌面版。</li>
          </ul>
        </li>

        <li className="ask__step">
          <h3 className="ask__step-title">開始問</h3>
          <p>在 Claude 桌面版問：</p>
          <blockquote className="ask__quote">
            我（profileId: {idForExample}）2027 年哪幾個月適合買車？asOf 用今天。
          </blockquote>
          <p className="ask__hint">
            Claude 會呼叫工具取得訊號與月份排名，回答裡引用的訊號編號都查得到。完整工具說明見專案的 docs/MCP-SETUP.md。
          </p>
        </li>

        <li className="ask__step">
          <h3 className="ask__step-title">檢查回答（選填）</h3>
          <p className="ask__hint">
            把 Claude 的回答貼回來，網站用這份報告的訊號對照：引用的編號是否存在、有沒有保證式用語、「高共識」有沒有算進實驗性系統。
            只在你的瀏覽器裡比對，不會送出任何資料。
          </p>
          <AnswerCheck report={report} />
        </li>
      </ol>
    </details>
  );
}
