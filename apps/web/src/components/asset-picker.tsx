import { Button } from '@nest/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@nest/ui/components/dialog';
import { Input } from '@nest/ui/components/input';
import { Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';

import { TRADE_ASSETS } from '../lib/market-assets.ts';
import { AssetIcon } from './asset-icon.tsx';

const ASSETS = TRADE_ASSETS;

export function AssetPicker({
  value,
  label,
  onChange,
  disabled = false,
  compact = false,
  assets: symbols = ASSETS.map((asset) => asset.symbol),
}: {
  value: string;
  label: string;
  onChange(value: string): void;
  disabled?: boolean;
  compact?: boolean;
  assets?: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const assets = ASSETS.filter(
    (asset) =>
      symbols.includes(asset.symbol) &&
      `${asset.symbol} ${asset.name}`.toLowerCase().includes(query.toLowerCase().trim()),
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <Button
        variant="outline"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={
          compact
            ? 'trade-market-picker ml-3 min-h-11 w-11 shrink-0 justify-center rounded-xl p-0'
            : 'trade-token-select'
        }
      >
        {!compact && (
          <>
            <AssetIcon symbol={value} className="size-6" />
            <span>{value}</span>
          </>
        )}
        <ChevronDown className="size-4" />
      </Button>
      <DialogContent className="nest-workspace asset-picker-dialog flex max-h-[calc(100dvh-40px)] flex-col gap-4 p-6 sm:max-w-[440px]">
        <div className="space-y-3 pr-8">
          <p className="font-mono text-[10px] tracking-widest text-subtle uppercase">Stellar / Assets</p>
          <DialogTitle className="font-serif text-[27px]">Choose Trading Asset</DialogTitle>
          <DialogDescription className="sr-only">
            Choose an asset for this market. Execution support is checked before a quote.
          </DialogDescription>
        </div>
        <Input
          type="search"
          aria-label="Search assets"
          placeholder="Search name or symbol…"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          className="min-h-11"
        />
        <div className="min-h-0 overflow-y-auto">
          {assets.map((asset) => (
            <Button
              key={asset.symbol}
              variant="ghost"
              className="h-auto min-h-[62px] w-full justify-start gap-3 rounded-xl border border-transparent px-3 py-2.5"
              aria-pressed={value === asset.symbol}
              onClick={() => {
                onChange(asset.symbol);
                setOpen(false);
                setQuery('');
              }}
            >
              <AssetIcon symbol={asset.symbol} className="size-8" />
              <span className="flex flex-1 flex-col items-start gap-1">
                <strong className="font-sans text-sm font-medium text-foreground">{asset.symbol}</strong>
                <span className="font-sans text-[11px] text-subtle">{asset.name}</span>
              </span>
              {value === asset.symbol && <Check className="size-4 text-primary" />}
            </Button>
          ))}
          {assets.length === 0 && <p className="py-8 text-center text-sm text-subtle">No assets match this search.</p>}
        </div>
        {compact && <p className="text-xs text-subtle">All markets are quoted in USDC. Choose the asset to inspect.</p>}
      </DialogContent>
    </Dialog>
  );
}
