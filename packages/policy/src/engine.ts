export type Severity = 'block' | 'warn';
export type Verdict = 'allow' | 'warn' | 'block';

export interface RuleOutcome {
  pass: boolean;
  /** Stable reason code, e.g. `SLIPPAGE_ABOVE_LIMIT`. */
  code: string;
  /** Human-readable explanation shown in the review. */
  detail: string;
  /** The facts the decision used, as display strings, so the review can show them. */
  facts?: Readonly<Record<string, string>>;
}

export interface Rule<F> {
  id: string;
  severity: Severity;
  check(facts: F): RuleOutcome;
}

export interface Reason extends RuleOutcome {
  rule: string;
  severity: Severity;
}

export interface Decision {
  verdict: Verdict;
  reasons: Reason[];
}

/**
 * Runs every rule in order and keeps every reason. A rule that throws or returns a malformed
 * outcome blocks, so an unknown critical fact can never allow an action.
 */
export function evaluate<F>(rules: readonly Rule<F>[], facts: F): Decision {
  const ids = new Set<string>();
  const reasons: Reason[] = [];
  for (const rule of rules) {
    if (ids.has(rule.id)) throw new Error(`Duplicate policy rule id: ${rule.id}`);
    ids.add(rule.id);
    reasons.push(run(rule, facts));
  }
  return { verdict: verdictOf(reasons), reasons };
}

function run<F>(rule: Rule<F>, facts: F): Reason {
  let outcome: unknown;
  try {
    outcome = rule.check(facts);
  } catch (error) {
    return {
      rule: rule.id,
      severity: 'block',
      pass: false,
      code: 'RULE_FAILED',
      detail: `The ${rule.id} check could not be evaluated: ${error instanceof Error ? error.message : 'unknown error'}`,
    };
  }
  if (!isOutcome(outcome)) {
    return {
      rule: rule.id,
      severity: 'block',
      pass: false,
      code: 'RULE_MALFORMED',
      detail: `The ${rule.id} check returned an invalid result.`,
    };
  }
  return { ...outcome, rule: rule.id, severity: rule.severity };
}

function verdictOf(reasons: readonly Reason[]): Verdict {
  if (reasons.some((reason) => !reason.pass && reason.severity === 'block')) return 'block';
  if (reasons.some((reason) => !reason.pass)) return 'warn';
  return 'allow';
}

function isOutcome(value: unknown): value is RuleOutcome {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.pass === 'boolean' &&
    typeof candidate.code === 'string' &&
    candidate.code.length > 0 &&
    typeof candidate.detail === 'string'
  );
}
