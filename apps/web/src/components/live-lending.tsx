import { Badge } from '@nest/ui/components/badge';
import { Button } from '@nest/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@nest/ui/components/card';
import { Input } from '@nest/ui/components/input';
import { Label } from '@nest/ui/components/label';
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from '@nest/ui/components/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@nest/ui/components/table';
import { useQuery } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';

import { ExecutionRequestError, execution, type LendingKind, type LendingMarkets } from '../lib/execution.ts';
import { formatUtc } from '../lib/format.ts';
import { LendingProposalCard } from './lending-proposal.tsx';

type Market = LendingMarkets['markets'][number];
type Reserve = Market['reserves'][number];

const REFRESH_MS = 60_000;

/** Live Blend pool rates. Each APY opens a popover that starts a reviewed supply or borrow. */
export function LiveLendingRates() {
  const markets = useQuery({
    queryKey: ['lending-markets'],
    queryFn: execution.lendingMarkets,
    refetchInterval: REFRESH_MS,
  });
  const observedAt = markets.data?.markets[0]?.observedAtMs;
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-2xl">Live lending rates</CardTitle>
        <CardDescription>
          Blend pools read from the network
          {observedAt ? ` at ${formatUtc(new Date(observedAt).toISOString())}` : ''}. Variable rates. Select an APY to
          lend or borrow at your size.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 overflow-x-auto">
        {markets.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Reading Blend pools…
          </p>
        ) : markets.isError ? (
          <p className="text-sm text-destructive">
            {markets.error instanceof ExecutionRequestError ? markets.error.message : 'Live rates are unavailable.'}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pool</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead className="text-right">Supply APY</TableHead>
                <TableHead className="text-right">Borrow APY</TableHead>
                <TableHead className="text-right">Utilization</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {markets.data.markets.flatMap((market) =>
                market.reserves.map((reserve) => (
                  <TableRow key={`${market.poolId}-${reserve.symbol}`}>
                    <TableCell>
                      <span className="font-medium">{market.name}</span>
                      <Badge variant="outline" className="ml-2">
                        {market.statusLabel}
                      </Badge>
                    </TableCell>
                    <TableCell>{reserve.symbol}</TableCell>
                    <TableCell className="text-right">
                      <RatePopover kind="supply" market={market} reserve={reserve} />
                    </TableCell>
                    <TableCell className="text-right">
                      <RatePopover kind="borrow" market={market} reserve={reserve} />
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {reserve.utilizationPct.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                )),
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function RatePopover({ kind, market, reserve }: { kind: LendingKind; market: Market; reserve: Reserve }) {
  const inputId = useId();
  const [amount, setAmount] = useState('100');
  const [intentId, setIntentId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apy = kind === 'supply' ? reserve.supplyApyPct : reserve.borrowApyPct;
  const collateral = reserve.symbol === 'USDC' ? 'XLM' : 'USDC';
  const blocked = kind === 'supply' ? !market.canSupply : !market.canBorrow;

  async function start(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      // Nest compares every pool, so the best rate can be a different pool than the one selected here.
      const intent = await execution.createLending({ kind, asset: reserve.symbol, amount: amount.trim() });
      setIntentId(intent.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The request could not be created.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Popover onOpenChange={(open) => (open ? null : setIntentId(null))}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="min-h-9 rounded-md px-2 font-mono tabular-nums underline decoration-dotted underline-offset-4 hover:bg-muted"
          />
        }
      >
        {apy.toFixed(2)}%
      </PopoverTrigger>
      <PopoverContent align="end" className={intentId ? 'w-96' : undefined}>
        <PopoverTitle>
          {kind === 'supply' ? 'Lend' : 'Borrow'} {reserve.symbol} · {market.name}
        </PopoverTitle>
        <PopoverDescription>
          {apy.toFixed(2)}% {kind === 'supply' ? 'supply' : 'borrow'} APY, variable.
          {kind === 'borrow' ? ` Collateral: ${collateral}, sized for a health factor of 1.6.` : ''}
        </PopoverDescription>
        {blocked ? (
          <p className="text-xs text-muted-foreground">
            This pool is {market.statusLabel.toLowerCase()}, so {kind === 'supply' ? 'deposits' : 'new loans'} are
            disabled here. Nest still compares every pool.
          </p>
        ) : null}
        {intentId ? (
          <LendingProposalCard intentId={intentId} />
        ) : (
          <form onSubmit={start} className="flex items-end gap-2">
            <div className="grid flex-1 gap-1.5">
              <Label htmlFor={inputId}>Amount ({reserve.symbol})</Label>
              <Input
                id={inputId}
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                pattern="^(0|[1-9][0-9]*)([.][0-9]{1,7})?$"
                required
              />
            </div>
            <Button type="submit" disabled={creating}>
              {creating ? <LoaderCircle className="animate-spin" /> : null}
              Compare
            </Button>
          </form>
        )}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </PopoverContent>
    </Popover>
  );
}
