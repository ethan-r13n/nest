import { Button } from '@nest/ui/components/button';
import { LoaderCircle, Wallet } from 'lucide-react';
import { useState } from 'react';

import { ExecutionRequestError, execution, type TrustlineUse } from '../lib/execution.ts';
import { shortAddress, useWallet } from '../lib/wallet.tsx';

/**
 * Adds the USDC trustline a plan stopped for. It is its own transaction because a Soroban call must
 * be the only operation in its transaction. Nest builds it; the user signs it in Freighter.
 */
export function TrustlineStep({ use, onAdded }: { use: TrustlineUse; onAdded(): void }) {
  const wallet = useWallet();
  const [state, setState] = useState<'idle' | 'building' | 'signing' | 'confirming'>('idle');
  const [issuer, setIssuer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!wallet.address) return;
    setError(null);
    setState('building');
    try {
      const prepared = await execution.trustline({ accountId: wallet.address, use });
      setIssuer(prepared.asset.issuer);
      setState('signing');
      const signedXdr = await wallet.sign(prepared.xdr, prepared.networkPassphrase);
      setState('confirming');
      await execution.submitTrustline({ accountId: wallet.address, use, signedXdr });
      onAdded();
    } catch (caught) {
      // Already trusted (added elsewhere meanwhile): nothing to do but continue.
      if (caught instanceof ExecutionRequestError && caught.code === 'CONFLICT') {
        onAdded();
        return;
      }
      setError(caught instanceof Error ? caught.message : 'The trustline could not be added.');
    } finally {
      setState('idle');
    }
  }

  const busy = state !== 'idle';
  return (
    <div className="space-y-2 rounded-md border border-dashed p-3">
      <p>Your account needs a USDC trustline before it can hold USDC. Add it once; then this continues.</p>
      {issuer ? <p className="font-mono text-xs text-subtle">Issuer {shortAddress(issuer)}</p> : null}
      <Button size="sm" onClick={add} disabled={busy || !wallet.address}>
        {busy ? <LoaderCircle className="animate-spin" /> : <Wallet />}
        {state === 'building'
          ? 'Preparing…'
          : state === 'signing'
            ? 'Waiting for wallet…'
            : state === 'confirming'
              ? 'Confirming…'
              : 'Add USDC trustline'}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
