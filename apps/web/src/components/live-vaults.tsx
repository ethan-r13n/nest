import { Badge } from '@nest/ui/components/badge';
import { Button } from '@nest/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@nest/ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@nest/ui/components/table';
import { useQuery } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';

import { ExecutionRequestError, execution, type VaultSummary } from '../lib/execution.ts';
import { VaultDepositDialog } from './vault-deposit-dialog.tsx';

const REFRESH_MS = 60_000;
const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

/** DeFindex vaults read live from DeFindex. Each supported vault deposits through a reviewed card. */
export function LiveVaults() {
  const vaults = useQuery({ queryKey: ['defindex-vaults'], queryFn: execution.vaults, refetchInterval: REFRESH_MS });
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-2xl">Live DeFindex vaults</CardTitle>
        <CardDescription>
          Read from DeFindex{vaults.data ? ` on ${vaults.data.network === 'mainnet' ? 'Mainnet' : 'Testnet'}` : ''}. APY
          is the 30-day figure net of the vault’s fee. Deposit in one step; Nest checks the vault’s code and shows the
          exact transaction before you sign.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 overflow-x-auto">
        {vaults.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Reading DeFindex vaults…
          </p>
        ) : vaults.isError ? (
          <p className="text-sm text-destructive">
            {vaults.error instanceof ExecutionRequestError ? vaults.error.message : 'Vaults are unavailable right now.'}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vault</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead className="text-right">APY</TableHead>
                <TableHead className="text-right">Holds</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Deposit</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...vaults.data.vaults]
                .sort((left, right) => (right.apyPct ?? -1) - (left.apyPct ?? -1))
                .map((vault) => (
                  <TableRow key={vault.address}>
                    <TableCell className="font-medium">{vault.name}</TableCell>
                    <TableCell>{vault.symbol ?? 'Other'}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {vault.apyPct === null ? '—' : `${vault.apyPct.toFixed(2)}%`}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {COMPACT.format(Number(vault.totalRaw) / 1e7)} {vault.symbol ?? ''}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{BigInt(vault.investedRaw) > 0n ? 'Invested' : 'Idle'}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {vault.symbol ? (
                        <DepositButton vault={vault} network={vaults.data.network} />
                      ) : (
                        <span className="text-xs text-subtle">USDC and XLM only</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function DepositButton({ vault, network }: { vault: VaultSummary; network: 'mainnet' | 'testnet' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Deposit
      </Button>
      <VaultDepositDialog vault={vault} network={network} open={open} onOpenChange={setOpen} />
    </>
  );
}
