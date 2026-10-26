import { SUGGESTED_GUARDRAILS } from '@nest/policy/guardrails';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@nest/ui/components/accordion';
import { Badge } from '@nest/ui/components/badge';
import { Button } from '@nest/ui/components/button';
import { Checkbox } from '@nest/ui/components/checkbox';
import { Input } from '@nest/ui/components/input';
import { Label } from '@nest/ui/components/label';
import { Separator } from '@nest/ui/components/separator';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@nest/ui/components/sheet';
import { ShieldCheck } from 'lucide-react';
import { useId, useState } from 'react';

import { DraftNotice } from './workspace.tsx';

const { values } = SUGGESTED_GUARDRAILS;
const CAPS = ['Funding', 'Spending', 'Daily turnover', 'Borrowing'];

export function GuardrailsDrawer() {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" aria-label="Guardrails" className="bg-transparent!" />}>
        <ShieldCheck />
        <span className="hidden sm:inline">Guardrails</span>
      </SheetTrigger>
      <SheetContent className="nest-workspace w-full sm:max-w-[440px]">
        <SheetHeader>
          <SheetTitle>Guardrails</SheetTitle>
          <SheetDescription>
            Review a draft. No preference applies until explicitly saved, and saving never approves a financial action.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          <GuardrailsEditor />
        </div>
        <div className="border-t p-4">
          <SheetClose render={<Button variant="ghost" className="w-full" />}>Close draft</SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function GuardrailsEditor() {
  const id = useId();
  const [caps, setCaps] = useState<string[]>([]);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">Suggested · not yet confirmed</Badge>
        <Badge variant="secondary">Unsaved draft</Badge>
      </div>
      <p className="text-xs text-subtle">No verified wallet or saved policy revision is loaded.</p>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 font-medium">Trade</legend>
        <div className="space-y-2">
          <Label htmlFor={`${id}-slippage`}>Slippage (%)</Label>
          <Input id={`${id}-slippage`} inputMode="decimal" defaultValue={String(values.slippageBps / 100)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-impact`}>Price impact warning (%)</Label>
          <Input id={`${id}-impact`} inputMode="decimal" defaultValue={String(values.priceImpactWarningBps / 100)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-expiry`}>Maximum quote age (seconds)</Label>
          <Input id={`${id}-expiry`} inputMode="numeric" defaultValue={String(values.quoteMaxAgeSeconds)} />
        </div>
      </fieldset>
      <p className="text-xs text-muted-foreground">
        Warnings are separate from hard limits. Provider validity can make a quote expire sooner.
      </p>
      <Separator />
      <fieldset className="space-y-3">
        <legend className="mb-2 font-medium">Fees</legend>
        <p className="text-xs text-muted-foreground">
          Approve the displayed maximum fees for each action. An additional custom ceiling is optional.
        </p>
        <Label htmlFor={`${id}-fee`}>Optional maximum network fee (XLM)</Label>
        <Input id={`${id}-fee`} inputMode="decimal" placeholder="No extra ceiling" />
      </fieldset>
      <Separator />
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 font-medium">Lending health</legend>
        <div className="space-y-2">
          <Label htmlFor={`${id}-minimum`}>Optional minimum health factor</Label>
          <Input id={`${id}-minimum`} inputMode="decimal" placeholder="Use venue requirements" />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-warning`}>Warn below health factor</Label>
          <Input id={`${id}-warning`} inputMode="decimal" defaultValue={values.healthFactorWarnBelow} />
        </div>
      </fieldset>
      <p className="text-xs text-muted-foreground">
        Health factor suggestions apply only where that native measure is supported. Venue liquidation rules always
        apply.
      </p>
      <Separator />
      <fieldset className="space-y-3">
        <legend className="mb-2 font-medium">Data freshness</legend>
        {['Venue quotes', 'Price observations', 'DefiLlama', 'RWA.xyz'].map((source) => (
          <div key={source} className="space-y-2">
            <Label htmlFor={`${id}-${source}`}>{source} maximum age (seconds)</Label>
            <Input id={`${id}-${source}`} inputMode="numeric" placeholder="Not configured" />
          </div>
        ))}
      </fieldset>
      <p className="text-xs text-muted-foreground">
        Stricter chain, oracle and venue validity cannot be relaxed by a preference. Dated snapshots do not become fresh
        signals.
      </p>
      <Accordion>
        <AccordionItem value="caps">
          <AccordionTrigger>Optional amount caps</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                All extra caps are off. The approved intent defines an action’s amount. These controls change the draft
                only.
              </p>
              {CAPS.map((cap) => (
                <div key={cap} className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Checkbox
                      checked={caps.includes(cap)}
                      onCheckedChange={(checked) =>
                        setCaps((current) => (checked ? [...current, cap] : current.filter((value) => value !== cap)))
                      }
                    />
                    {cap}
                  </Label>
                  {caps.includes(cap) ? <Input aria-label={`${cap} cap draft`} placeholder="Amount and asset" /> : null}
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <DraftNotice>
        Saving preferences is unavailable until wallet sign-in is connected. This draft never changes execution
        permissions.
      </DraftNotice>
      <Button className="w-full" disabled>
        Save preferences
      </Button>
    </div>
  );
}
