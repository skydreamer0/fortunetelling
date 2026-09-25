/** Browser-only persistence for recent queries. No report data leaves the device. */

import type { BirthInput } from '../model/types';

export const REPORT_STORE_KEY = 'fortunetelling:queries:v1';
export const COMPATIBILITY_STORE_KEY = 'fortunetelling:compatibility:v1';
export const MAX_RECENT_QUERIES = 8;

export interface RecentQuery {
  fingerprint: string;
  savedAt: string;
  asOf: string | null;
  input: BirthInput;
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function normalizeInput(input: Partial<BirthInput> = {}): BirthInput {
  return {
    name: typeof input.name === 'string' ? input.name.slice(0, 120) : '',
    year: Number(input.year),
    month: Number(input.month),
    day: Number(input.day),
    hour: Number.isInteger(Number(input.hour)) ? Number(input.hour) : 12,
    minute: Number.isInteger(Number(input.minute)) ? Number(input.minute) : 0,
    timeKnown: input.timeKnown !== false,
    gender: input.gender === 'female' ? 'female' : 'male',
    calendarType: input.calendarType === 'lunar' ? 'lunar' : 'solar',
    ...(input.lunarInput ? { lunarInput: input.lunarInput } : {}),
  };
}

function isUsable(input: BirthInput): boolean {
  return Number.isInteger(input.year) && Number.isInteger(input.month) && Number.isInteger(input.day);
}

export function safeLocalStorage(): KeyValueStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function createReportStore(storage: KeyValueStorage | undefined = safeLocalStorage()) {
  function read(): RecentQuery[] {
    try {
      const parsed = JSON.parse(storage?.getItem(REPORT_STORE_KEY) ?? '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map(item => ({ ...item, input: normalizeInput(item.input) }))
        .filter(item => isUsable(item.input))
        .slice(0, MAX_RECENT_QUERIES);
    } catch {
      return [];
    }
  }

  function write(items: RecentQuery[]): boolean {
    try {
      storage?.setItem(REPORT_STORE_KEY, JSON.stringify(items.slice(0, MAX_RECENT_QUERIES)));
      return true;
    } catch {
      return false;
    }
  }

  return {
    getRecent: read,
    getLastInput(): BirthInput | null {
      return read()[0]?.input ?? null;
    },
    save(input: Partial<BirthInput>, { asOf = null }: { asOf?: string | null } = {}): boolean {
      const normalized = normalizeInput(input);
      if (!isUsable(normalized)) return false;
      const fingerprint = [normalized.name, normalized.year, normalized.month, normalized.day,
        normalized.hour, normalized.timeKnown, normalized.gender].join('|');
      const next = read().filter(item => item.fingerprint !== fingerprint);
      next.unshift({ fingerprint, savedAt: new Date().toISOString(), asOf, input: normalized });
      return write(next);
    },
    getLastCompatibility(): { first: BirthInput; second: BirthInput } | null {
      try {
        const parsed = JSON.parse(storage?.getItem(COMPATIBILITY_STORE_KEY) ?? 'null');
        if (!parsed?.first || !parsed?.second) return null;
        const first = normalizeInput(parsed.first);
        const second = normalizeInput(parsed.second);
        return isUsable(first) && isUsable(second) ? { first, second } : null;
      } catch {
        return null;
      }
    },
    saveCompatibility(first: Partial<BirthInput>, second: Partial<BirthInput>): boolean {
      const pair = { first: normalizeInput(first), second: normalizeInput(second) };
      if (!isUsable(pair.first) || !isUsable(pair.second)) return false;
      try {
        storage?.setItem(COMPATIBILITY_STORE_KEY, JSON.stringify(pair));
        return true;
      } catch {
        return false;
      }
    },
    clear(): boolean {
      try {
        storage?.removeItem(REPORT_STORE_KEY);
        storage?.removeItem(COMPATIBILITY_STORE_KEY);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export type ReportStore = ReturnType<typeof createReportStore>;
