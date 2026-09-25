/**
 * Browser-safe entry (`@fortune/ai/copy`) for the static site: copy-paste prompt
 * and paste-back checker only. Never re-export `./client` or `./anthropic` here —
 * the web bundle must stay free of the Anthropic SDK (D-035).
 */
export * from './copyPrompt';
export * from './pasteCheck';
