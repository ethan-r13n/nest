import { SUGGESTED_GUARDRAILS } from '@nest/policy/guardrails';
import { Badge } from '@nest/ui/components/badge';
import { Button } from '@nest/ui/components/button';
import { Separator } from '@nest/ui/components/separator';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@nest/ui/components/sheet';
import { ShieldCheck } from 'lucide-react';

const { values } = SUGGESTED_GUARDRAILS;

const SETTINGS = [
  { group: 'Trade', label: 'Slippage', value: `${values.slippageBps / 100}%` },
  { group: 'Trade', label: 'Price impact warning', value: `above ${values.priceImpactWarningBps / 100}%` },
  { group: 'Data freshness', label: 'Quote expiry', value: `${values.quoteMaxAgeSeconds} seconds` },
  { group: 'Lending', label: 'Health factor warning', value: `below ${values.healthFactorWarnBelow}` },
] as const;

export function GuardrailsDrawer() {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" aria-label="Guardrails" />}>
        <ShieldCheck />
        <span className="hidden sm:inline">Guardrails</span>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-[440px]">
        <SheetHeader>
          <SheetTitle>Guardrails</SheetTitle>
          <SheetDescription>
            Limits for your wallet and network. Nothing here applies until you save it, and saving never approves an
            action.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-4">
          {SETTINGS.map((setting) => (
            <div key={setting.label} className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-subtle">{setting.group}</p>
                <p className="font-medium">{setting.label}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="font-mono tabular-nums">{setting.value}</span>
                <Badge variant="outline">Suggested · not yet confirmed</Badge>
              </div>
            </div>
          ))}
          <Separator />
          <p className="text-sm text-muted-foreground">
            Optional amount caps (funding, spending, daily turnover, borrowing) are off unless you enable them.
          </p>
        </div>
        <SheetFooter>
          <Button disabled>Save preferences</Button>
          <SheetClose render={<Button variant="ghost" />}>Cancel</SheetClose>
          <p className="text-xs text-subtle">Saving needs wallet sign-in, which isn't available in this build yet.</p>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
