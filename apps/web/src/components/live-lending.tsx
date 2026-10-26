import { Badge } from '@nest/ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@nest/ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@nest/ui/components/table';
import { cn } from '@nest/ui/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';

import { ExecutionRequestError, execution, type LendingKind, type LendingMarkets } from '../lib/execution.ts';
import { formatUtc } from '../lib/format.ts';
import { useOpenSelectionCommand } from './selection-command.tsx';

type Market = LendingMarkets['markets'][number];
type Reserve = Market['reserves'][number];

const REFRESH_MS = 60_000;

/** Live Blend pool rates. Highlighting or selecting an APY opens the selection command box. */
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
          {observedAt ? ` at ${formatUtc(new Date(observedAt).toISOString())}` : ''}. Variable rates. Highlight an APY
          and type a command, such as “lend 100 usdc”.
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
                  <TableRow
                    key={`${market.poolId}-${reserve.symbol}`}
                    data-nest-context={JSON.stringify({
                      poolId: market.poolId,
                      poolName: market.name,
                      asset: reserve.symbol,
                      canSupply: market.canSupply,
                      canBorrow: market.canBorrow,
                    })}
                  >
                    <TableCell>
                      <span className="font-medium">{market.name}</span>
                      <Badge variant="outline" className="ml-2">
                        {market.statusLabel}
                      </Badge>
                    </TableCell>
                    <TableCell>{reserve.symbol}</TableCell>
                    <TableCell className="text-right">
                      <RateCell kind="supply" market={market} reserve={reserve} />
                    </TableCell>
                    <TableCell className="text-right">
                      <RateCell kind="borrow" market={market} reserve={reserve} />
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

function RateCell({ kind, market, reserve }: { kind: LendingKind; market: Market; reserve: Reserve }) {
  const openCommand = useOpenSelectionCommand();
  const apy = kind === 'supply' ? reserve.supplyApyPct : reserve.borrowApyPct;
  const blocked = kind === 'supply' ? !market.canSupply : !market.canBorrow;
  return (
    // biome-ignore lint/a11y/useSemanticElements: text in a <button> cannot be drag-selected, and highlighting the rate is the point. A click or Enter opens the same command box.
    <span
      data-nest-rate={kind}
      data-nest-apy={apy}
      role="button"
      tabIndex={0}
      aria-label={`${apy.toFixed(2)}% ${kind} APY for ${reserve.symbol} in ${market.name}${blocked ? `, ${market.statusLabel.toLowerCase()}` : ''}`}
      onKeyDown={(event) => {
        if (!openCommand || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        openCommand(event.currentTarget);
      }}
      className={cn(
        'inline-flex min-h-9 cursor-text items-center rounded-md px-2 font-mono tabular-nums underline decoration-dotted underline-offset-4 hover:bg-muted',
        blocked && 'text-muted-foreground',
      )}
    >
      {apy.toFixed(2)}%
    </span>
  );
}
