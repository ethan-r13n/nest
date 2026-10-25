import { describe, expect, it } from 'vitest';

import { evaluate, type Rule } from '../src/engine.ts';

interface Facts {
  slippageBps: number;
  limitBps: number;
  impactBps: number | null;
}

const slippage: Rule<Facts> = {
  id: 'slippage',
  severity: 'block',
  check: (facts) => ({
    pass: facts.slippageBps <= facts.limitBps,
    code: facts.slippageBps <= facts.limitBps ? 'SLIPPAGE_OK' : 'SLIPPAGE_ABOVE_LIMIT',
    detail: `Slippage ${facts.slippageBps} bps against a ${facts.limitBps} bps limit.`,
    facts: { slippageBps: String(facts.slippageBps) },
  }),
};

const impact: Rule<Facts> = {
  id: 'price-impact',
  severity: 'warn',
  check: (facts) => {
    if (facts.impactBps === null) throw new Error('price impact is unavailable');
    return { pass: facts.impactBps <= 100, code: 'PRICE_IMPACT', detail: `Impact ${facts.impactBps} bps.` };
  },
};

describe('evaluate', () => {
  it('allows when every rule passes and keeps every reason in order', () => {
    const decision = evaluate([slippage, impact], { slippageBps: 30, limitBps: 50, impactBps: 10 });
    expect(decision.verdict).toBe('allow');
    expect(decision.reasons.map((reason) => reason.rule)).toEqual(['slippage', 'price-impact']);
  });

  it('warns on a failed warning rule without blocking', () => {
    const decision = evaluate([slippage, impact], { slippageBps: 30, limitBps: 50, impactBps: 250 });
    expect(decision.verdict).toBe('warn');
  });

  it('blocks on a failed blocking rule', () => {
    const decision = evaluate([slippage, impact], { slippageBps: 80, limitBps: 50, impactBps: 10 });
    expect(decision.verdict).toBe('block');
    expect(decision.reasons[0]?.code).toBe('SLIPPAGE_ABOVE_LIMIT');
  });

  it('blocks when a rule throws, even a warning rule', () => {
    const decision = evaluate([slippage, impact], { slippageBps: 30, limitBps: 50, impactBps: null });
    expect(decision.verdict).toBe('block');
    expect(decision.reasons[1]).toMatchObject({ rule: 'price-impact', severity: 'block', code: 'RULE_FAILED' });
  });

  it('blocks when a rule returns a malformed outcome', () => {
    const broken = { id: 'broken', severity: 'warn', check: () => ({ pass: 'yes' }) } as unknown as Rule<Facts>;
    const decision = evaluate([broken], { slippageBps: 0, limitBps: 0, impactBps: 0 });
    expect(decision).toMatchObject({ verdict: 'block', reasons: [{ code: 'RULE_MALFORMED' }] });
  });

  it('refuses duplicate rule ids', () => {
    expect(() => evaluate([slippage, slippage], { slippageBps: 0, limitBps: 0, impactBps: 0 })).toThrow(/Duplicate/);
  });
});
