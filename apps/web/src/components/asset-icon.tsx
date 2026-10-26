import stellarUrl from '../../../../design/nest/ui/assets/logos/stellar-5114812d.png';
import usdcUrl from '../../../../design/nest/ui/assets/logos/usdc-e68e4b37.png';
import usdtUrl from '../../../../design/nest/ui/assets/logos/usdt0-8202acdd.webp';

export function AssetIcon({ symbol, className = 'size-9' }: { symbol: string; className?: string }) {
  const src = symbol === 'XLM' ? stellarUrl : symbol === 'USDC' ? usdcUrl : symbol === 'USDT0' ? usdtUrl : null;
  return src ? (
    <img src={src} alt="" className={`shrink-0 rounded-full object-contain ${className}`} />
  ) : (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full border font-mono text-xs ${className}`}
    >
      {symbol.slice(0, 3)}
    </span>
  );
}
