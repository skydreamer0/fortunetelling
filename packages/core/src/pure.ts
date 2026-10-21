/** Calculator-free runtime surface shared with the AI package. */
export {
  validateQuestionRequest,
  listQuestionCategories,
  QUESTION_CATALOG,
  QUESTION_CATALOG_VERSION,
} from './questions/engine';
export { HonestyGuard } from './analysis/HonestyGuard';
export { scrubDeep, sensitiveStringsOf, REDACTED_NAME, REDACTED_PLACE } from './export/redact';
export type { SensitiveStrings } from './export/redact';
export {
  shortSignalId,
  resolveSignalId,
  shortIdCollisions,
  shortenSignalIds,
  isSignalIdLike,
  SIGNAL_ID_PATTERN,
  SHORT_ID_HEX,
} from './signals/shortId';
export type { SignalIdResolution } from './signals/shortId';
export { EXPERIMENTAL_SYSTEMS } from './signals/eligibility';
export {
  DIRECTIONAL_POLICY, HIGH_CONSENSUS_MIN_SYSTEMS, directionalVotes, evidenceMatchesContext,
  supportsHighConsensusCitations, validAgreementThresholds,
} from './signals/directionalEvidence';
export type { DirectionalEvidence, AgreementThresholds, AgreementCitation } from './signals/directionalEvidence';

export { questionModelIdentityV4 } from './questions/engine.v4';
