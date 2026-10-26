import { Button } from '@nest/ui/components/button';
import { useState } from 'react';

import type { VaultSummary } from '../lib/execution.ts';
import { VaultDepositDialog } from './vault-deposit-dialog.tsx';

export function VaultDepositButton({
  vault,
  network,
  initialAmount,
}: {
  vault: VaultSummary;
  network: 'mainnet' | 'testnet';
  initialAmount?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" className="workspace-action" onClick={() => setOpen(true)}>
        Deposit →
      </Button>
      <VaultDepositDialog
        vault={vault}
        network={network}
        open={open}
        onOpenChange={setOpen}
        initialAmount={initialAmount}
      />
    </>
  );
}
