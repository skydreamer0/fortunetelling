/** Internal producer contracts for the existing Human Design components (#21).
 * These describe the legacy payloads; they do not validate chart calculations.
 */
import type { HumanDesignChart } from './calculator';
import type { Center } from './bodygraph';
import type { HdChannel, PlanetActivation } from './humanDesign';

type Part<Category extends string, Id extends string, Value> = {
  id: Id;
  name: string;
  category: Category;
  value: Value;
};

/** The shared loop retains its existing union-valued side without a cast. */
export type HumanDesignActivationComponent<Side extends 'personality' | 'design'> = Part<
  Side,
  `hd_${Side}_${PlanetActivation['planet']}`,
  PlanetActivation
>;

/** Nine categories, with their existing IDs and payloads. None emits metadata. */
export type HumanDesignComponent =
  | Part<'type', 'hd_type', { type: NonNullable<HumanDesignChart['type']>; name: string }>
  | Part<'authority', 'hd_authority', { authority: HumanDesignChart['authority'] }>
  | Part<'profile', 'hd_profile', HumanDesignChart['profile']>
  | Part<'definition', 'hd_definition', { definition: HumanDesignChart['definition'] }>
  | Part<'incarnationCross', 'hd_incarnation_cross', HumanDesignChart['incarnationCross']>
  | Part<'centers', `hd_center_${Center}`, { center: Center; defined: boolean }>
  | Part<'channels', `hd_channel_${HdChannel['id']}`, HdChannel>
  | HumanDesignActivationComponent<'personality'>
  | HumanDesignActivationComponent<'design'>;
