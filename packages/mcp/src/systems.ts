/**
 * `systems`／`verifiedOnly` 參數（answer_question、get_timeline、get_consensus 共用）：
 * 決定這次只採計哪些系統的訊號。篩選本身由 core 做（answerQuestion 的 `systems`、
 * restrictTimeline），這裡只負責驗證參數、算出要回報的 systemsUsed／excludedSystems。
 */

import { EXPERIMENTAL_SYSTEM_IDS, TIMELINE_SYSTEMS, type SystemId } from '@fortune/core';
import { z } from 'zod';
import type { Analysis } from './compute';
import { ToolError } from './errors';

export const systemsInput = z
  .array(z.string())
  .optional()
  .describe(
    `Only count signals from these systems, e.g. ["bazi","ziwei"]. Available: ${TIMELINE_SYSTEMS.join(', ')}. ` +
      'Scores, consensus and conflicts are recomputed from that subset (not re-weighted). Omit = all systems.',
  );

export const verifiedOnlyInput = z
  .boolean()
  .optional()
  .describe(`true = drop the experimental, not yet cross-validated systems (${EXPERIMENTAL_SYSTEM_IDS.join(', ')}). Combines with systems.`);

export type SystemSelection = {
  /** 呼叫端有沒有要求篩選（systems 或 verifiedOnly）。false 時走原本未篩選的路徑。 */
  filtered: boolean;
  /** 實際採計、且對這個 profile 有產生訊號的系統（SYSTEM_IDS 順序）。 */
  systemsUsed: SystemId[];
  /** 這個 profile 本來會參與、但這次被排除的系統。 */
  excludedSystems: SystemId[];
  experimentalIncluded: boolean;
};

const isExperimental = (s: SystemId) => EXPERIMENTAL_SYSTEM_IDS.includes(s);

/** 驗證 systems／verifiedOnly；未知名稱、空清單或篩完沒有任何可用系統都回 invalid_args。 */
export function resolveSystems(
  analysis: Pick<Analysis, 'timeline'>,
  systems: readonly string[] | undefined,
  verifiedOnly: boolean | undefined,
): SystemSelection {
  const available = analysis.timeline.systems;
  const availableSystems = [...TIMELINE_SYSTEMS];
  let wanted: Set<string> | null = null;
  if (systems !== undefined) {
    const unknown = [...new Set(systems.filter(s => !availableSystems.includes(s as SystemId)))];
    if (unknown.length > 0) {
      throw new ToolError(
        'invalid_args',
        `Unknown system(s): ${unknown.join(', ')}`,
        `Use system ids from availableSystems (${availableSystems.join(', ')}).`,
        { unknown, availableSystems },
      );
    }
    if (systems.length === 0) {
      throw new ToolError('invalid_args', 'systems must not be empty', 'Omit systems to use every system.', { availableSystems });
    }
    wanted = new Set(systems);
  }
  if (verifiedOnly) {
    wanted = new Set([...(wanted ?? availableSystems)].filter(s => !isExperimental(s as SystemId)));
  }
  if (!wanted) {
    return { filtered: false, systemsUsed: [...available], excludedSystems: [], experimentalIncluded: available.some(isExperimental) };
  }
  const systemsUsed = available.filter(s => wanted!.has(s));
  if (systemsUsed.length === 0) {
    throw new ToolError(
      'invalid_args',
      'None of the selected systems contributes signals for this profile',
      'Pick systems from contributingSystems (others are skipped for this profile, e.g. birth time unknown).',
      { availableSystems, contributingSystems: [...available] },
    );
  }
  return {
    filtered: true,
    systemsUsed,
    excludedSystems: available.filter(s => !wanted!.has(s)),
    experimentalIncluded: systemsUsed.some(isExperimental),
  };
}

/** 回應中固定帶的三個欄位。 */
export function systemsFields(sel: SystemSelection) {
  return { systemsUsed: sel.systemsUsed, excludedSystems: sel.excludedSystems, experimentalIncluded: sel.experimentalIncluded };
}
