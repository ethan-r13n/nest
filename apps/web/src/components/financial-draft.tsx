import { Badge } from '@nest/ui/components/badge';
import { Field, FieldDescription, FieldError, FieldLabel } from '@nest/ui/components/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@nest/ui/components/input-group';
import { Label } from '@nest/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@nest/ui/components/select';
import { Link } from '@tanstack/react-router';
import { Clock3, ShieldCheck } from 'lucide-react';
import { useId } from 'react';

import { amountDraftIssue } from '../lib/draft-validation.ts';

const DRAFT_ASSETS = ['XLM', 'USDC', 'USDT0'];

export function AssetSelect({
  label,
  value,
  onChange,
  disabled = false,
  assets = DRAFT_ASSETS,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  assets?: readonly string[];
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select disabled={disabled} value={value} onValueChange={(next) => next !== null && onChange(next)}>
        <SelectTrigger id={id} className="min-h-11 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {assets.map((asset) => (
            <SelectItem className="min-h-11" key={asset} value={asset}>
              {asset}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function DecimalField({
  label,
  value,
  onChange,
  placeholder = 'Enter an amount',
  disabled = false,
  hint,
  unit,
  inputId,
  required = false,
  allowZero = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
  unit?: string;
  inputId?: string;
  required?: boolean;
  allowZero?: boolean;
}) {
  const generatedId = useId();
  const id = inputId ?? generatedId;
  const issue = amountDraftIssue(value, required, allowZero);
  const descriptionIds = [hint ? `${id}-hint` : '', issue ? `${id}-error` : ''].filter(Boolean).join(' ');
  return (
    <Field data-invalid={Boolean(issue)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup className="min-h-11">
        <InputGroupInput
          id={id}
          className="min-h-11 min-w-0 font-mono tabular-nums"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
          aria-invalid={Boolean(issue)}
          aria-describedby={descriptionIds || undefined}
        />
        {unit ? (
          <InputGroupAddon align="inline-end" className="font-mono text-xs">
            {unit}
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      {hint ? <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription> : null}
      {issue ? <FieldError id={`${id}-error`}>{issue}</FieldError> : null}
    </Field>
  );
}

export function WithdrawalTiming() {
  return (
    <div className="rounded-lg border border-warning/40 bg-warning/5 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Clock3 className="size-4 text-warning" aria-hidden="true" />
        Withdrawal timing
        <Badge variant="outline" className="ml-auto">
          Unknown
        </Badge>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Current lockups, cooldowns, queues and settlement timing have not been verified. An unknown duration does not
        mean an instant exit. These terms must be shown before any deposit can be reviewed.
      </p>
    </div>
  );
}

export function UnavailableFacts({ labels }: { labels: string[] }) {
  return (
    <dl className="space-y-3 text-sm">
      {labels.map((label) => (
        <div key={label} className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-mono text-subtle">
            <span aria-hidden="true">—</span>
            <span className="sr-only">Unavailable</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function CreditNavigation({ current }: { current: 'borrow' | 'supply' | 'positions' }) {
  return (
    <nav aria-label="Credit views" className="flex flex-wrap gap-2 text-sm">
      <Link
        to="/credit"
        className={creditLink(current === 'borrow')}
        aria-current={current === 'borrow' ? 'page' : undefined}
      >
        Borrow
      </Link>
      <Link
        to="/credit/supply"
        className={creditLink(current === 'supply')}
        aria-current={current === 'supply' ? 'page' : undefined}
      >
        Supply
      </Link>
      <Link
        to="/credit/positions"
        className={creditLink(current === 'positions')}
        aria-current={current === 'positions' ? 'page' : undefined}
      >
        My positions
      </Link>
      <Link
        to="/earn"
        className="inline-flex min-h-11 items-center px-4 text-xs text-muted-foreground hover:text-foreground"
      >
        Supply opportunities ↗
      </Link>
    </nav>
  );
}

export function ReviewRequirements() {
  return (
    <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
      <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />A fresh quote, exact fees, withdrawal terms
      where relevant, and your wallet approval are required before execution.
    </p>
  );
}

function creditLink(active: boolean) {
  return `inline-flex min-h-11 items-center rounded-lg px-4 transition-colors ${active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`;
}
