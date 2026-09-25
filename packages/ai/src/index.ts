/**
 * @fortune/ai — AI interpretation layer (V5-03/V5-04, ARCHITECTURE-V2 §9).
 * Reads Report JSON only; never imports calculators or 命理 libraries (D-021).
 */
export * from './payload';
export * from './prompts';
export * from './schema';
export * from './vocab';
export * from './validate';
export * from './client';
export * from './copyPrompt';
export * from './pasteCheck';
export { canonicalJson, sha256Hex } from './canonical';
