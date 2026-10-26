import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@nest/ui/components/card';

import { GuardrailsEditor } from '../components/guardrails-drawer.tsx';
import { PageHeader } from '../components/workspace.tsx';

export function GuardrailsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Your execution preferences"
        kicker="Preferences"
        description="Review the bounds for an action before it reaches your wallet. Suggestions stay unconfirmed until you explicitly save them."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Execution preferences</CardTitle>
            <CardDescription>Draft settings · no saved revision</CardDescription>
          </CardHeader>
          <CardContent>
            <GuardrailsEditor />
          </CardContent>
        </Card>
        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Effective rules</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-3 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>Chain, oracle and venue validity always apply.</li>
                <li>Warnings remain separate from hard limits.</li>
                <li>Every financial action needs its own review and wallet signature.</li>
                <li>Saving preferences never approves a transaction.</li>
                <li>The agent cannot change your permissions.</li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Saved policy</CardTitle>
              <CardDescription>No verified revision loaded</CardDescription>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-muted-foreground">
              Draft controls are not an active policy revision. Saved settings require wallet ownership verification and
              an explicit save.
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
