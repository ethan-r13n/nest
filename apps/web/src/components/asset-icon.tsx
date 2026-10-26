import { ProtocolLogo } from './protocol-logo.tsx';

export function AssetIcon({ symbol, className = 'size-9' }: { symbol: string; className?: string }) {
  return <ProtocolLogo name={symbol} className={className} />;
}
