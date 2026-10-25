import { Button } from '@nest/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@nest/ui/components/card';
import { Link } from '@tanstack/react-router';
import { ShieldCheck, Wallet } from 'lucide-react';

import { GuardrailsEditor } from '../components/guardrails-drawer.tsx';
import { DraftNotice, PageHeader } from '../components/workspace.tsx';

export function GuardrailsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Guardrails"
        kicker="Preferences"
        description="Review the bounds for an action before it reaches your wallet. Suggestions stay unconfirmed until you explicitly save them."
      />
      <Card>
        <CardHeader>
          <CardTitle>Execution preferences</CardTitle>
          <CardDescription>Draft settings · no saved revision</CardDescription>
        </CardHeader>
        <CardContent>
          <GuardrailsEditor />
        </CardContent>
      </Card>
    </div>
  );
}

export function WalletPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Your wallet, your approval"
        kicker="Wallet access"
        description="Use a Stellar wallet to prove ownership, save private history and review each financial action."
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="size-5 text-primary" />
            Freighter
          </CardTitle>
          <CardDescription>Selected wallet for the first release</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Wallet connection and sign-in are not available in this build. No account is connected, and no balances or
            saved history are being loaded.
          </p>
          <Button disabled>Connect Freighter</Button>
          <DraftNotice>
            Never enter a wallet seed phrase or private key in Nest. You review and sign in your wallet.
          </DraftNotice>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" />
            What happens next
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-3 pl-5 text-sm text-muted-foreground">
            <li>Choose your account and the expected network in your wallet.</li>
            <li>Review a sign-in challenge to prove ownership. Signing in never approves a financial action.</li>
            <li>Compare an action, inspect its exact effects and fees, then approve its separate wallet request.</li>
          </ol>
        </CardContent>
      </Card>
      <Button nativeButton={false} variant="outline" render={<Link to="/research" />}>
        Explore public research
      </Button>
    </div>
  );
}
