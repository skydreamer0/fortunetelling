export type CopyOutcome = 'clipboard' | 'selected' | 'failed';

/**
 * Copy with the Clipboard API; when it is missing or refused, fall back to
 * selecting the preview text (and trying the legacy copy command).
 */
export async function copyText(
  text: string,
  env: { clipboard?: { writeText(value: string): Promise<void> } | null; select?: () => boolean },
): Promise<CopyOutcome> {
  if (env.clipboard?.writeText) {
    try {
      await env.clipboard.writeText(text);
      return 'clipboard';
    } catch {
      // fall through to the selection fallback
    }
  }
  return env.select?.() ? 'selected' : 'failed';
}
