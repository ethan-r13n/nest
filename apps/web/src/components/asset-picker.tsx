import { Button } from '@nest/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@nest/ui/components/dialog';
import { Input } from '@nest/ui/components/input';
import { Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';

import { AssetIcon } from './asset-icon.tsx';

const ASSETS = [
  { symbol: 'XLM', name: 'Stellar Lumens' },
  { symbol: 'USDC', name: 'USD Coin' },
  { symbol: 'USDT0', name: 'USDT0' },
];

export function AssetPicker({
  value,
  label,
  onChange,
  disabled = false,
  compact = false,
}: {
  value: string;
  label: string;
  onChange(value: string): void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const assets = ASSETS.filter((asset) =>
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
            ? 'ml-3 min-h-11 w-11 shrink-0 justify-center rounded-xl border-primary/60 p-0 hover:border-primary focus-visible:border-primary'
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
      <DialogContent className="nest-workspace asset-picker-dialog gap-5 p-6 sm:max-w-[560px]">
        <div className="space-y-3 pr-8">
          <p className="font-mono text-[10px] tracking-widest text-subtle uppercase">Stellar / Assets</p>
          <DialogTitle className="font-serif text-3xl">Choose trading asset</DialogTitle>
          <DialogDescription>
            Choose an asset for this market. Execution support is checked before a quote.
          </DialogDescription>
        </div>
        <Input
          type="search"
          aria-label="Search assets"
          placeholder="Search assets…"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          className="min-h-11"
        />
        <div className="grid gap-2">
          {assets.map((asset) => (
            <Button
              key={asset.symbol}
              variant="ghost"
              className="h-auto min-h-16 w-full justify-start gap-4 rounded-xl border p-4"
              aria-pressed={value === asset.symbol}
              onClick={() => {
                onChange(asset.symbol);
                setOpen(false);
                setQuery('');
              }}
            >
              <AssetIcon symbol={asset.symbol} />
              <span className="flex flex-1 flex-col items-start gap-1">
                <strong className="font-sans text-sm">{asset.symbol}</strong>
                <span className="font-sans text-xs text-subtle">{asset.name}</span>
              </span>
              {value === asset.symbol && <Check className="size-4 text-primary" />}
            </Button>
          ))}
          {assets.length === 0 && <p className="py-8 text-center text-sm text-subtle">No assets match this search.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
