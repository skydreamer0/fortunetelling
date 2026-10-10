/** Private matcher sidecar. Never accepted as caller-owned provenance. */
import { interpretationData } from '../core/interpretationSpec';
export type PlacementDependency = { role: string; palace: number; star: string; mutagen?: string };
import type { NatalPillar } from './bazi/chart';
export type NativeHitMetadata =
 | { kind: 'bazi.stemControl'; directed: boolean; complete: boolean; controller: NatalPillar; controlled: NatalPillar }
 | { kind: 'ziwei.star-placement'; hostPalace: number; sourcePalace: number; star: string; borrowed: boolean; dependencies: readonly PlacementDependency[] };
const hits = new WeakMap<object, NativeHitMetadata>();
export function retainNativeHit<T extends object>(hit: T, metadata: NativeHitMetadata): T {
  hits.set(hit, interpretationData(metadata)); return hit;
}
export function nativeHitMetadata(hit: object): NativeHitMetadata | undefined { return hits.get(hit); }
