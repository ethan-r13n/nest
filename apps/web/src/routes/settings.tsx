import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@nest/ui/components/card';

import { GuardrailsEditor } from '../components/guardrails-drawer.tsx';
import { PageHeader } from '../components/workspace.tsx';

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
