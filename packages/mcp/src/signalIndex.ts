/**
 * 已知訊號宇宙：完整編號／前綴解析與短編號輸出的共同依據。
 *
 * - 初始內容 = timeline 的全部訊號；`absorbYear(year)` 把某年的月訊號併入（每年只併一次）。
 * - `resolve`：先查已知宇宙；命中 exact／唯一前綴就停。找不到（none）才由中心年向外逐年擴大並重新解析，
 *   絕不為了「確認唯一」而掃完全部年份（取捨：8 位十六進位 = 32 位元，數千筆訊號的碰撞機率極低；
 *   若唯一命中之後才在更遠的年份出現同前綴，會在那一年被納入宇宙後變成 ambiguous——因為輸出端
 *   用 `shortIds` 對「已知宇宙」檢查碰撞，輸出過的編號所屬年份必定已在宇宙內）。
 * - `shortIds`：縮成 sig_ + 8 位；已知宇宙內碰撞的保留完整編號，確保輸出的每個編號都能被唯一解析。
 */

import { resolveSignalId, shortIdCollisions, shortSignalId, type Signal } from '@fortune/core';

export type SignalResolution =
  | { status: 'exact' | 'unique'; signal: Signal }
  | { status: 'ambiguous'; matches: string[] }
  | { status: 'none' | 'invalid' };

export class SignalIndex {
  private known = new Map<string, Signal>();
  private absorbed = new Set<number>();
  private collidingFor = -1;
  private colliding = new Set<string>();

  constructor(
    initial: Iterable<Signal>,
    private years: { min: number; max: number; center: number },
    /** 取得某年全部月訊號（呼叫端負責快取，同一年只建一次 timeline）。 */
    private loadYear: (year: number) => Iterable<Signal>,
  ) {
    for (const s of initial) this.known.set(s.id, s);
  }

  get size(): number {
    return this.known.size;
  }

  /** 併入某年的月訊號（已併過的年份略過）。 */
  absorbYear(year: number): void {
    if (this.absorbed.has(year)) return;
    this.absorbed.add(year);
    for (const s of this.loadYear(year)) this.known.set(s.id, s);
  }

  /** 併入一組外部取得的訊號（例如 answer_question 用到的年份已被併入時不需要）。 */
  absorbSignals(signals: Iterable<Signal>): void {
    for (const s of signals) this.known.set(s.id, s);
  }

  private attempt(input: string): SignalResolution {
    const r = resolveSignalId(input, this.known.keys());
    if (r.status === 'exact' || r.status === 'unique') return { status: r.status, signal: this.known.get(r.id)! };
    return r.status === 'ambiguous' ? { status: 'ambiguous', matches: r.matches } : { status: r.status };
  }

  resolve(input: string): SignalResolution {
    let r = this.attempt(input);
    if (r.status !== 'none') return r;
    const { min, max, center } = this.years;
    for (let d = 0; d <= Math.max(center - min, max - center); d++) {
      for (const year of d === 0 ? [center] : [center - d, center + d]) {
        if (year < min || year > max || this.absorbed.has(year)) continue;
        this.absorbYear(year);
        r = this.attempt(input);
        if (r.status !== 'none') return r;
      }
    }
    return r;
  }

  shortIds(ids: readonly string[]): string[] {
    if (this.collidingFor !== this.known.size) {
      this.colliding = new Set(shortIdCollisions(this.known.keys()).flat());
      this.collidingFor = this.known.size;
    }
    return ids.map(id => (this.colliding.has(id) ? id : shortSignalId(id)));
  }
}
