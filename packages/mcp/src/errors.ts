/** Structured tool error: the model sees `{ error: { code, message, hint? } }`, never a stack trace. */
export type ToolErrorCode =
  | 'invalid_args'
  | 'profile_not_found'
  | 'profile_invalid'
  | 'unknown_signal'
  | 'response_too_large'
  | 'unsupported'
  | 'internal';

export class ToolError extends Error {
  constructor(
    readonly code: ToolErrorCode,
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = 'ToolError';
  }
}
