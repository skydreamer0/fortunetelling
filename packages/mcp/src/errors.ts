/** Structured tool error: the model sees `{ error: { code, message, hint?, details? } }`, never a stack trace. */
export type ToolErrorCode =
  | 'invalid_args'
  | 'profile_not_found'
  | 'profile_invalid'
  | 'profile_exists'
  | 'unknown_signal'
  | 'ambiguous_signal'
  | 'response_too_large'
  | 'unsupported'
  | 'internal';

export class ToolError extends Error {
  constructor(
    readonly code: ToolErrorCode,
    message: string,
    readonly hint?: string,
    /** Machine-readable extras, e.g. `{ availableCategories }`. */
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ToolError';
  }
}
