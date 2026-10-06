/**
 * 短訊號編號：完整編號是 `sig_` + 16 位十六進位（20 字），外部（MCP 回傳、複製 prompt）的人與模型
 * 要逐字抄寫，太長容易抄錯。顯示用短編號 = `sig_` + 前 {@link SHORT_ID_HEX} 位（12 字）。
 *
 * 規則（不改完整編號、不改雜湊，所有 golden 的完整編號維持不變）：
 *   - 輸出可以用短編號；輸入接受「完整編號」或「至少 8 位的前綴」。
 *   - 前綴要在已知訊號中唯一才算解析成功；對到多筆回 `ambiguous`，絕不猜。
 *   - 短編號在同一份訊號集合內可能碰撞（機率極低，但不為零）：用 {@link shortIdCollisions}
 *     檢查，輸出端遇到碰撞就退回完整編號。
 */

export const SIGNAL_ID_PREFIX = 'sig_';
/** 短編號的十六進位位數（也是接受的最短前綴）。 */
export const SHORT_ID_HEX = 8;
const FULL_HEX = 16;

/** 文字中的訊號編號（完整或前綴）；大小寫不分。 */
export const SIGNAL_ID_PATTERN = /sig_[0-9a-fA-F]{8,16}/g;

const HEX_RE = /^[0-9a-f]+$/;

/** 完整編號 → 短編號；已經是短的或格式不對就原樣回傳。 */
export function shortSignalId(id: string): string {
  const lower = id.toLowerCase();
  if (!lower.startsWith(SIGNAL_ID_PREFIX)) return id;
  const hex = lower.slice(SIGNAL_ID_PREFIX.length);
  if (!HEX_RE.test(hex) || hex.length <= SHORT_ID_HEX) return id;
  return `${SIGNAL_ID_PREFIX}${hex.slice(0, SHORT_ID_HEX)}`;
}

/** 是不是合法的「完整編號或前綴」（`sig_` + 8～16 位十六進位）。 */
export function isSignalIdLike(text: string): boolean {
  const lower = text.toLowerCase();
  if (!lower.startsWith(SIGNAL_ID_PREFIX)) return false;
  const hex = lower.slice(SIGNAL_ID_PREFIX.length);
  return hex.length >= SHORT_ID_HEX && hex.length <= FULL_HEX && HEX_RE.test(hex);
}

export type SignalIdResolution =
  | { status: 'exact'; id: string }
  | { status: 'unique'; id: string }
  | { status: 'ambiguous'; matches: string[] }
  | { status: 'none' }
  | { status: 'invalid' };

/**
 * 以完整編號或前綴在 `knownIds` 中找訊號。
 * 完整編號命中 → exact；前綴只對到一筆 → unique；多筆 → ambiguous；沒有 → none；格式不對 → invalid。
 */
export function resolveSignalId(input: string, knownIds: Iterable<string>): SignalIdResolution {
  const wanted = input.trim().toLowerCase();
  if (!isSignalIdLike(wanted)) return { status: 'invalid' };
  const matches = new Set<string>();
  for (const id of knownIds) {
    if (id === wanted) return { status: 'exact', id };
    if (id.startsWith(wanted)) matches.add(id);
  }
  if (matches.size === 1) return { status: 'unique', id: [...matches][0] };
  if (matches.size > 1) return { status: 'ambiguous', matches: [...matches].sort() };
  return { status: 'none' };
}

/** 一組完整編號中，短編號相同的群組（長度 ≥ 2 才列出）。空陣列 = 全部可安全縮短。 */
export function shortIdCollisions(ids: Iterable<string>): string[][] {
  const groups = new Map<string, Set<string>>();
  for (const id of ids) {
    const short = shortSignalId(id);
    let group = groups.get(short);
    if (!group) groups.set(short, (group = new Set()));
    group.add(id);
  }
  return [...groups.values()].filter(group => group.size > 1).map(group => [...group].sort());
}

/**
 * 輸出用：把編號縮短，但碰撞的那幾個維持完整編號，確保輸出內的每個編號都能被唯一解析。
 * `universe` 是用來判斷碰撞的完整編號集合（至少要包含 `ids`）。
 */
export function shortenSignalIds(ids: readonly string[], universe: Iterable<string> = ids): string[] {
  const colliding = new Set(shortIdCollisions(universe).flat());
  return ids.map(id => (colliding.has(id) ? id : shortSignalId(id)));
}
