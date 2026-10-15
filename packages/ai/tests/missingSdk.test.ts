import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => { vi.doUnmock('@anthropic-ai/sdk'); vi.resetModules(); vi.unstubAllGlobals(); });

test('missing optional SDK: actionable first-completion failure and injected-client escape hatch (isolated module)', async () => {
  vi.resetModules();
  let loadAttempts = 0;
  let networkAttempts = 0;
  const missing = new Error('fixture: optional SDK module cannot be loaded');
  vi.doMock('@anthropic-ai/sdk', () => {
    loadAttempts++;
    throw missing;
  });
  // Fail closed if a regression unexpectedly tries to send a request.
  const rejectNetwork = () => {
    networkAttempts++;
    throw new Error('fixture: network is forbidden');
  };
  vi.stubGlobal('fetch', rejectNetwork);
  
  const { createAnthropicComplete, MISSING_SDK_MESSAGE } = await import('../src/anthropic');
  const request = { purpose: 'interpret' as const, system: 'synthetic', user: [{ text: 'synthetic' }], schema: {}, maxTokens: 1 };
  expect(loadAttempts).toBe(0); // importing the entry point does not require the optional SDK
  const complete = createAnthropicComplete();
  expect(loadAttempts).toBe(0); // construction stays lazy too
  
  let firstError: unknown;
  try { await complete(request); } catch (error) { firstError = error; }
  expect(firstError).toBeInstanceOf(Error);
  expect((firstError as Error).message).toBe(MISSING_SDK_MESSAGE);
  expect((firstError as Error).message).toContain('npm install @anthropic-ai/sdk');
  expect((firstError as Error).message).toContain('client');
  expect((firstError as Error).message).toContain('complete');
  // Vitest wraps a throwing module factory; retain the original failure as its cause.
  const cause = (firstError as Error).cause;
  expect(cause === missing || (cause instanceof Error && cause.cause === missing)).toBe(true);
  expect(loadAttempts).toBe(1);
  await expect(complete(request)).rejects.toBe(firstError); // the same failed load is memoized
  expect(loadAttempts).toBe(1);
  
  let injectedCalls = 0;
  const injected = createAnthropicComplete({ client: {
    beta: { messages: { stream: () => {
      injectedCalls++;
      return { finalMessage: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'synthetic response' }] }) };
    } } },
  } as never });
  expect(await injected(request)).toBe('synthetic response');
  expect(injectedCalls).toBe(1);
  expect(loadAttempts).toBe(1); // injection still works when loading the SDK is impossible
  expect(networkAttempts).toBe(0);
  
});
