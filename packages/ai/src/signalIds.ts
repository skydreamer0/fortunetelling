/**
 * 訊號編號的解析（短編號 `sig_` + 8 位、完整編號 `sig_` + 16 位、或 ≥ 8 位前綴）。
 * 規則與 core 的 `resolveSignalId` 一致：前綴要唯一才解析，ambiguous 絕不猜。
 * 純函式、瀏覽器安全；對照規則的唯一來源是 core 的 shortId（經 core-pure 匯入）。
 */
import { isSignalIdLike } from './core-pure';

/**
 * 在「payload 內的編號」中找回答所引用的那一筆。payload 內的編號可能是短編號（複製 prompt）
 * 或完整編號（API 路徑／碰撞者），所以前綴關係兩個方向都算：引用是 payload 編號的前綴，
 * 或 payload 編號是引用的前綴（引用寫了完整編號、payload 只放短編號）。
 * 回傳 payload 內的那個編號；查不到或對到多筆（ambiguous）回 null。
 */
export function resolveCitation(cited: string, payloadIds: Iterable<string>): string | null {
  const wanted = cited.trim().toLowerCase();
  const ids = [...payloadIds];
  // 完全相同優先（即使不是十六進位，例如測試用的假編號）
  for (const id of ids) if (id === cited || id === wanted) return id;
  if (!isSignalIdLike(wanted)) return null;
  const hits = new Set<string>();
  for (const id of ids) {
    const lower = id.toLowerCase();
    if (lower.startsWith(wanted) || (isSignalIdLike(lower) && wanted.startsWith(lower))) hits.add(id);
  }
  return hits.size === 1 ? [...hits][0] : null;
}
