import { Button } from '@nest/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@nest/ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@nest/ui/components/table';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Wallet } from 'lucide-react';

import { execution } from '../lib/execution.ts';
import { useHealth } from '../lib/health.ts';
import { lendingExits } from '../lib/position-management.ts';
import { useWallet } from '../lib/wallet.tsx';
import { LendingPositionAction } from './position-actions.tsx';
import { EmptyState, StatCard } from './workspace.tsx';

export function CreditPositions() {
  const wallet = useWallet();
  const health = useHealth();
  const positions = useQuery({
    queryKey: ['positions', wallet.address],
    queryFn: () => execution.positions(wallet.address ?? ''),
    enabled: Boolean(wallet.address),
    refetchInterval: 30_000,
  });
  const data = positions.data;
  const sameNetwork = data && data.network === health.data?.network;
  const rows = data && sameNetwork && wallet.address ? lendingExits(data, wallet.address) : [];
  const complete = sameNetwork && data.blend.available && data.xoxno.available;
  const counts = [
    ['Collateral positions', rows.filter((row) => row.kind === 'withdraw_collateral').length],
    ['Debt positions', rows.filter((row) => row.kind === 'repay').length],
    ['Supply positions', rows.filter((row) => row.kind === 'withdraw').length],
    ['Lending accounts', new Set(rows.map((row) => `${row.poolId}:${row.lendingAccountId ?? ''}`)).size],
  ] as const;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {counts.map(([label, count]) => (
          <StatCard
            key={label}
            label={label}
            value={complete ? String(count) : '—'}
            detail={complete ? 'Read from the connected network' : 'Waiting for complete position data'}
          />
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Open positions</CardTitle>
          <CardDescription>Confirmed positions are separate from pending settlement.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!wallet.address ? (
            <EmptyState
              title="Connect a wallet to read its positions"
              description="Read supply, collateral, debt and current health from Blend and XOXNO."
            >
              <Button onClick={wallet.connect} disabled={wallet.connecting}>
                <Wallet /> Connect wallet
              </Button>
            </EmptyState>
          ) : positions.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              Reading lending positions…
            </p>
          ) : positions.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Positions could not be read. Missing data is not a zero balance.
            </p>
          ) : data && !sameNetwork ? (
            <p role="alert" className="text-sm text-destructive">
              The position source does not match the active network. Actions are unavailable.
            </p>
          ) : rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Venue / account</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead className="text-right">Manage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell>{row.poolName}</TableCell>
                    <TableCell>
                      {row.kind === 'repay' ? 'Debt' : row.kind === 'withdraw' ? 'Supplied' : 'Collateral'}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {row.held} {row.symbol}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {row.health === null ? 'No debt' : row.health.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <LendingPositionAction position={row} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title="No supported lending positions found"
              description="Only positions successfully read on this network appear here. Unavailable sources are reported below."
            />
          )}
          {data && !data.blend.available ? <p className="text-xs text-muted-foreground">{data.blend.reason}</p> : null}
          {data && !data.xoxno.available ? <p className="text-xs text-muted-foreground">{data.xoxno.reason}</p> : null}
          {wallet.address ? (
            <Button variant="outline" size="sm" disabled={positions.isFetching} onClick={() => positions.refetch()}>
              <RefreshCw /> Refresh positions
            </Button>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Manage position</CardTitle>
          <CardDescription>Select Repay or Withdraw beside the exact position and lending account.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Choose a partial amount or Use all. Nest refreshes accrued debt, owned balances, liquidity and collateral
            health before review. Every transaction still needs your wallet signature.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
