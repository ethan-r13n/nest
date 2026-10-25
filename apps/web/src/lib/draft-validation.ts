export function amountDraftIssue(value: string, required = false, allowZero = false) {
  if (!value) return required ? 'Enter an amount.' : null;
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return 'Use decimal digits without separators.';
  if (!allowZero && !/[1-9]/.test(value)) return 'Enter an amount greater than zero.';
  return null;
}
