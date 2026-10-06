import { describe, expect, test } from 'bun:test';
import {
  isSignalIdLike, resolveSignalId, shortIdCollisions, shortSignalId, shortenSignalIds, SHORT_ID_HEX,
} from '../src/signals/shortId';

const A = 'sig_2ed657b94383de3d';
const B = 'sig_2ed657b9ffffffff'; // 與 A 的前 8 位相同
const C = 'sig_8da186d9d2457bb1';

describe('短訊號編號', () => {
  test('縮短為 sig_ + 8 位；已短或格式不對原樣回傳', () => {
    expect(shortSignalId(A)).toBe('sig_2ed657b9');
    expect(shortSignalId('sig_2ed657b9')).toBe('sig_2ed657b9');
    expect(shortSignalId('hello')).toBe('hello');
    expect(shortSignalId('sig_xyz')).toBe('sig_xyz');
    expect(shortSignalId(A).length).toBe(4 + SHORT_ID_HEX);
  });

  test('isSignalIdLike：接受 8～16 位，拒絕太短與非十六進位', () => {
    expect(isSignalIdLike(A)).toBe(true);
    expect(isSignalIdLike('sig_2ed657b9')).toBe(true);
    expect(isSignalIdLike('SIG_2ED657B9')).toBe(true);
    expect(isSignalIdLike('sig_2ed657b')).toBe(false);
    expect(isSignalIdLike('sig_2ed657zz')).toBe(false);
    expect(isSignalIdLike(`${A}0`)).toBe(false);
  });

  test('resolveSignalId：完整＝exact、唯一前綴＝unique、多筆＝ambiguous、沒有＝none、格式錯＝invalid', () => {
    const known = [A, C];
    expect(resolveSignalId(A, known)).toEqual({ status: 'exact', id: A });
    expect(resolveSignalId('sig_2ed657b9', known)).toEqual({ status: 'unique', id: A });
    expect(resolveSignalId('SIG_2ED657B9', known)).toEqual({ status: 'unique', id: A });
    expect(resolveSignalId('sig_00000000', known)).toEqual({ status: 'none' });
    expect(resolveSignalId('sig_2ed657b9', [A, B, C])).toEqual({ status: 'ambiguous', matches: [A, B].sort() });
    expect(resolveSignalId('sig_123', known)).toEqual({ status: 'invalid' });
    expect(resolveSignalId(B, [A, B])).toEqual({ status: 'exact', id: B });
  });

  test('shortIdCollisions／shortenSignalIds：碰撞的維持完整編號，其餘縮短', () => {
    expect(shortIdCollisions([A, C])).toEqual([]);
    expect(shortIdCollisions([A, B, C])).toEqual([[A, B].sort()]);
    expect(shortenSignalIds([A, C])).toEqual(['sig_2ed657b9', 'sig_8da186d9']);
    expect(shortenSignalIds([A, B, C])).toEqual([A, B, 'sig_8da186d9']);
    // 輸出只含 A，但宇宙裡有 B 與它碰撞 → 仍維持完整編號
    expect(shortenSignalIds([A], [A, B, C])).toEqual([A]);
  });
});
