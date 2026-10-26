export function maxSwapAmount(spendable: string, symbol: 'XLM' | 'USDC'): string | null {
  if (!/^(0|[1-9]\d*)(\.\d{1,7})?$/.test(spendable)) return null;
  const [whole = '0', fraction = ''] = spendable.split('.');
  const raw = BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, '0'));
  const maximum = raw - (symbol === 'XLM' ? 5_000_000n : 0n);
  if (maximum <= 0n) return null;
  const remainder = (maximum % 10_000_000n).toString().padStart(7, '0').replace(/0+$/, '');
  return `${maximum / 10_000_000n}${remainder ? `.${remainder}` : ''}`;
}
