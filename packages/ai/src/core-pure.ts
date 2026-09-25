/**
 * The ONLY runtime bridge from `@fortune/ai` into `@fortune/core` (D-021).
 *
 * Why deep relative imports instead of `import … from '@fortune/core'`:
 * the core barrel (`packages/core/src/index.js`) re-exports every calculator
 * and engine, so importing ANY runtime value from it would load iztro,
 * lunar-javascript and the Swiss Ephemeris into the AI layer — which D-021
 * forbids ("packages/ai 不得 import 命理函式庫或計算器"). Core only exposes
 * "." in its `exports` map, so the pure modules are reached by path here.
 *
 * Allowed here: pure validators / data with no calculator dependency.
 *   - questions/engine  → validateQuestionRequest, catalog (imports only signals/aggregate, signals/bands, catalog.json)
 *   - analysis/HonestyGuard → zero-dependency lint
 * Everything else from core must be `import type` (erased at runtime).
 * `tests/boundaries.test.ts` enforces this.
 *
 * Follow-up (core owners): add subpath exports such as
 * `"./questions"` and `"./honesty"` to `packages/core/package.json` so this file
 * can import `@fortune/core/questions` instead of relative paths.
 */
export {
  validateQuestionRequest,
  listQuestionCategories,
  QUESTION_CATALOG,
  QUESTION_CATALOG_VERSION,
} from '../../core/src/questions/engine';
export { HonestyGuard } from '../../core/src/analysis/HonestyGuard.js';
