/** Internal adapter; the public ZiweiEngine constructor still accepts no natal object. */
import type { BirthData } from '../../core/models/BirthData';
import { ZiweiEngine } from '../../engines/ZiweiEngine';
import type { ZiweiNatalBasis } from './natalBasis';

export class ZiweiNatalBasisEngine extends ZiweiEngine {
  #natalBasis?: () => ZiweiNatalBasis;

  constructor({ asOf, natalBasis }: { asOf: Date; natalBasis?: () => ZiweiNatalBasis }) {
    super({ asOf });
    this.#natalBasis = natalBasis;
  }

  protected _createAstrolabe(birth: BirthData) {
    if (!this.#natalBasis) return super._createAstrolabe(birth);
    const basis = this.#natalBasis(), time = basis.time;
    if (!time || time.date.split('-').map(Number).join('-') !== birth.solarDateStr
      || time.timeIndex !== birth.timeIndex || basis.gender !== birth.gender) {
      throw new Error('Ziwei natal basis engine input mismatch');
    }
    return basis.astrolabeFor(time);
  }

  _compute(birth: BirthData) {
    const result = super._compute(birth);
    if (this.#natalBasis) {
      // Legacy serialization includes references such as decadalRange. Keep
      // public mutable results detached from the private library capability.
      result.components = structuredClone(result.components);
      result.meta = structuredClone(result.meta);
    }
    return result;
  }
}
