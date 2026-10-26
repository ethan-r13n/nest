import { describe, expect, it } from 'vitest';

// Compatibility gate result (docs/architecture-decisions.md): pi-coding-agent 1.4.0 cannot load in workerd,
// with or without nodejs_compat, because its undici 8 dependency needs Node internals at import time.
// These are expected failures; when a Pi release fixes it they start passing and Vitest reports them,
// which is the signal to revisit the hosting decision.
describe('pi-coding-agent in workerd', () => {
  it.fails('imports the SDK entry point', async () => {
    const sdk = await import('@earendil-works/pi-coding-agent');
    expect(typeof sdk.createAgentSession).toBe('function');
  });

  it.fails('builds in-memory session and settings managers', async () => {
    const { SessionManager, SettingsManager } = await import('@earendil-works/pi-coding-agent');
    expect(SessionManager.inMemory('/nest')).toBeDefined();
    expect(SettingsManager.inMemory({ compaction: { enabled: true } })).toBeDefined();
  });
});
