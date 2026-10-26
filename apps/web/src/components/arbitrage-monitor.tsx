import { Badge } from '@nest/ui/components/badge';
import { Button } from '@nest/ui/components/button';
import { Input } from '@nest/ui/components/input';
import { Label } from '@nest/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@nest/ui/components/select';
import { cn } from '@nest/ui/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRight, BellRing, CheckCircle2, LoaderCircle, Pause, Play, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';

import {
  ARB_VENUES,
  type ArbitrageConfig,
  type ArbVenue,
  type Automation,
  automations,
  type EvaluationResult,
  type Evidence,
  percent,
  VENUE_LABELS,
} from '../lib/automations.ts';
import { ExecutionRequestError } from '../lib/execution.ts';

const PREVIEW_REFRESH_MS = 20_000;
const RULES_REFRESH_MS = 15_000;
const CLOCK = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'UTC',
});
const SIZE_PATTERN = /^(0|[1-9]\d{0,6})(\.\d{1,7})?$/;

/**
 * Builds an arbitrage monitor over two XLM/USDC pools. The preview reads both pools live; saving
 * creates a draft, and checks only start once the user activates that exact revision.
 */
export function ArbitrageBuilder({ onActivated }: { onActivated(id: string): void }) {
  const queryClient = useQueryClient();
  const [venueA, setVenueA] = useState<ArbVenue>('soroswap');
  const [venueB, setVenueB] = useState<ArbVenue>('stellar_amm');
  const [size, setSize] = useState('100');
  const [thresholdPct, setThresholdPct] = useState('0.5');
  const [cooldown, setCooldown] = useState('15');
  const [mode, setMode] = useState<'repeat' | 'once'>('repeat');
  const [draft, setDraft] = useState<Automation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const thresholdBps = Math.round(Number(thresholdPct) * 100);
  const cooldownMinutes = Number(cooldown);
  const problem =
    venueA === venueB
      ? 'Choose two different pools.'
      : !SIZE_PATTERN.test(size) || Number(size) <= 0
        ? 'Enter a trade size in USDC.'
        : !Number.isFinite(thresholdBps) || thresholdBps < 1 || thresholdBps > 5_000
          ? 'Set a threshold between 0.01% and 50%.'
          : !Number.isInteger(cooldownMinutes) || cooldownMinutes < 1 || cooldownMinutes > 1_440
            ? 'Set a cooldown between 1 and 1,440 minutes.'
            : null;
  const config: ArbitrageConfig = { venues: [venueA, venueB], sizeUsdc: size, thresholdBps, cooldownMinutes, mode };
  const preview = useQuery({
    queryKey: ['automation-preview', config],
    queryFn: () => automations.preview(config),
    enabled: problem === null && draft === null,
    refetchInterval: PREVIEW_REFRESH_MS,
    retry: false,
  });

  const save = useMutation({
    mutationFn: () => automations.create({ config }),
    onSuccess: (created) => {
      setDraft(created);
      setError(null);
    },
    onError: (caught) => setError(messageOf(caught)),
  });
  const activate = useMutation({
    mutationFn: (rule: Automation) => automations.activate(rule),
    onSuccess: (rule) => {
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ['automations'] });
      onActivated(rule.id);
    },
    onError: (caught) => setError(messageOf(caught)),
  });
  const discard = useMutation({
    mutationFn: (id: string) => automations.remove(id),
    onSuccess: () => setDraft(null),
  });

  if (draft) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Review the exact rule before Nest starts checking it.</p>
        <RuleFacts rule={draft} />
        <p className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
          Checks run about every {draft.intervalSeconds} seconds and raise an alert in Nest. The monitor only reads pool
          reserves: it never trades, signs or moves funds.
        </p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => activate.mutate(draft)} disabled={activate.isPending}>
            {activate.isPending ? <LoaderCircle className="animate-spin" /> : <Play />} Activate monitor
          </Button>
          <Button variant="outline" onClick={() => discard.mutate(draft.id)} disabled={discard.isPending}>
            Discard draft
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <VenueSelect label="Pool A" value={venueA} onChange={setVenueA} />
        <VenueSelect label="Pool B" value={venueB} onChange={setVenueB} />
        <NumberField
          label="Trade size (USDC)"
          value={size}
          onChange={setSize}
          hint="The round trip the gap is measured on."
        />
        <NumberField
          label="Alert at profit of (%)"
          value={thresholdPct}
          onChange={setThresholdPct}
          hint="After both pools' fees and price impact."
        />
        <NumberField
          label="Cooldown (minutes)"
          value={cooldown}
          onChange={setCooldown}
          hint="Minimum time between alerts."
        />
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-sm font-medium">Repeat</span>
          <div className="flex gap-2">
            {(['repeat', 'once'] as const).map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={mode === option ? 'default' : 'outline'}
                aria-pressed={mode === option}
                onClick={() => setMode(option)}
              >
                {option === 'repeat' ? 'Every time the gap reopens' : 'Once, then stop'}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {problem ? (
        <p className="text-sm text-destructive">{problem}</p>
      ) : preview.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> Reading both pools…
        </p>
      ) : preview.isError ? (
        <p className="text-sm text-destructive">{messageOf(preview.error)}</p>
      ) : (
        <PreviewCard
          result={preview.data.result}
          reason={preview.data.reason}
          evidence={preview.data.evidence}
          evaluatedAt={preview.data.evaluatedAt}
        />
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button onClick={() => save.mutate()} disabled={problem !== null || save.isPending}>
        {save.isPending ? <LoaderCircle className="animate-spin" /> : null} Save draft
      </Button>
    </div>
  );
}

/** Rules for this network, with their state and unread alerts. */
export function AutomationList({ selectedId, onSelect }: { selectedId: string | null; onSelect(id: string): void }) {
  const list = useQuery({ queryKey: ['automations'], queryFn: automations.list, refetchInterval: RULES_REFRESH_MS });
  if (list.isPending) return <p className="text-sm text-muted-foreground">Loading monitors…</p>;
  if (list.isError) return <p className="text-sm text-destructive">{messageOf(list.error)}</p>;
  if (!list.data.length) {
    return <p className="text-sm text-muted-foreground">No monitors yet. Build one to start watching a price gap.</p>;
  }
  return (
    <ul className="space-y-2">
      {list.data.map((rule) => (
        <li key={rule.id}>
          <button
            type="button"
            onClick={() => onSelect(rule.id)}
            aria-pressed={rule.id === selectedId}
            className={cn(
              'w-full rounded-md border px-3 py-2 text-left text-sm transition-colors',
              rule.id === selectedId ? 'border-primary bg-primary/5' : 'hover:bg-muted',
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-medium">{rule.name}</span>
              {rule.unacknowledgedAlerts ? (
                <Badge>
                  <BellRing className="size-3" /> {rule.unacknowledgedAlerts}
                </Badge>
              ) : null}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <StatusBadge status={rule.status} />
              {resultLabel(rule.lastResult)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** One monitor: its settings, controls, alerts and recent checks with their evidence. */
export function AutomationDetail({ id, onDeleted }: { id: string; onDeleted?(): void }) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ['automation', id],
    queryFn: () => automations.read(id),
    refetchInterval: RULES_REFRESH_MS,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['automation', id] });
    void queryClient.invalidateQueries({ queryKey: ['automations'] });
  };
  const pause = useMutation({ mutationFn: () => automations.pause(id), onSuccess: refresh });
  const resume = useMutation({
    mutationFn: () => {
      if (!detail.data) throw new Error('The monitor is still loading.');
      return automations.activate(detail.data);
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => automations.remove(id),
    onSuccess: () => {
      refresh();
      onDeleted?.();
    },
  });
  const acknowledge = useMutation({ mutationFn: automations.acknowledge, onSuccess: refresh });

  if (detail.isPending) return <p className="text-sm text-muted-foreground">Loading monitor…</p>;
  if (detail.isError) return <p className="text-sm text-destructive">{messageOf(detail.error)}</p>;
  const rule = detail.data;
  const failure = pause.error ?? resume.error ?? remove.error ?? acknowledge.error;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{rule.name}</p>
          <p className="text-xs text-muted-foreground">
            Revision {rule.revision} ·{' '}
            {rule.status === 'active'
              ? rule.armed
                ? 'armed'
                : 'alerted; re-arms when the gap closes'
              : 'not checking'}
          </p>
        </div>
        <div className="flex gap-2">
          {rule.status === 'active' ? (
            <Button size="sm" variant="outline" onClick={() => pause.mutate()} disabled={pause.isPending}>
              <Pause /> Pause
            </Button>
          ) : (
            <Button size="sm" onClick={() => resume.mutate()} disabled={resume.isPending}>
              <Play /> {rule.status === 'draft' ? 'Activate' : 'Resume'}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            aria-label="Delete monitor"
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      <RuleFacts rule={rule} />
      {failure ? <p className="text-sm text-destructive">{messageOf(failure)}</p> : null}

      <section aria-label="Alerts" className="space-y-2">
        <h3 className="text-xs uppercase tracking-wider text-subtle">Alerts</h3>
        {rule.alerts.length ? (
          <ul className="space-y-2">
            {rule.alerts.map((alert) => (
              <li
                key={alert.id}
                className={cn(
                  'flex items-start justify-between gap-3 rounded-md border p-3 text-sm',
                  alert.acknowledgedAt ? 'opacity-70' : 'border-primary/60 bg-primary/5',
                )}
              >
                <span>
                  <span className="block text-xs text-muted-foreground">{clock(alert.createdAt)}</span>
                  {alert.summary}
                </span>
                {alert.acknowledgedAt ? (
                  <CheckCircle2 className="mt-1 size-4 shrink-0 text-muted-foreground" aria-label="Acknowledged" />
                ) : (
                  <Button size="sm" variant="outline" onClick={() => acknowledge.mutate(alert.id)}>
                    Acknowledge
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No alerts yet.</p>
        )}
      </section>

      <section aria-label="Recent checks" className="space-y-2">
        <h3 className="text-xs uppercase tracking-wider text-subtle">Recent checks</h3>
        {rule.evaluations.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-normal">Checked</th>
                  <th className="py-1 pr-3 font-normal">Result</th>
                  <th className="py-1 pr-3 text-right font-normal">Profit at size</th>
                  <th className="py-1 font-normal">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {rule.evaluations.map((evaluation) => (
                  <tr key={evaluation.id} className="border-t align-top">
                    <td className="py-2 pr-3 whitespace-nowrap font-mono text-xs tabular-nums">
                      {clock(evaluation.evaluatedAt)}
                      <span className="block text-subtle">+{Math.round(evaluation.delayMs / 1000)}s late</span>
                    </td>
                    <td className="py-2 pr-3">
                      <ResultBadge result={evaluation.result} />
                      {evaluation.triggered ? (
                        <BellRing className="ml-1 inline size-3.5 text-primary" aria-label="Alerted" />
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">
                      {percent(evaluation.evidence.profitBps)}
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">{evaluation.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {rule.status === 'active' ? 'The first check runs within about a minute.' : 'No checks recorded.'}
          </p>
        )}
      </section>
      <Link
        to="/lab/automations/$automationId/history"
        params={{ automationId: rule.id }}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        Full history <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}

function PreviewCard({
  result,
  reason,
  evidence,
  evaluatedAt,
}: {
  result: EvaluationResult;
  reason: string;
  evidence: Evidence;
  evaluatedAt: string;
}) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wider text-subtle">Live now · {clock(evaluatedAt)}</span>
        <ResultBadge result={result} preview />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {evidence.readings.map((reading) => (
          <div key={reading.venue} className="rounded-md bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">{VENUE_LABELS[reading.venue]}</p>
            <p className="font-mono text-lg tabular-nums">{reading.priceUsdcPerXlm.toFixed(4)}</p>
            <p className="text-xs text-subtle">
              USDC per XLM · fee {(reading.feeBps / 100).toFixed(2)}% · {compact(reading.xlmReserve)} XLM /{' '}
              {compact(reading.usdcReserve)} USDC
            </p>
          </div>
        ))}
        {evidence.errors.map((error) => (
          <div key={error.venue} className="rounded-md bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">{VENUE_LABELS[error.venue]}</p>
            <p className="text-sm text-destructive">{error.message}</p>
          </div>
        ))}
      </div>
      {evidence.profitBps !== null ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Price gap</dt>
          <dd className="text-right font-mono tabular-nums">{percent(evidence.spreadBps, false)}</dd>
          <dt className="text-muted-foreground">Round trip on {evidence.sizeUsdc} USDC</dt>
          <dd className="text-right font-mono tabular-nums">
            {percent(evidence.profitBps)} ({Number(evidence.profitUsdc).toFixed(2)} USDC)
          </dd>
          {evidence.buyOn && evidence.sellOn ? (
            <>
              <dt className="text-muted-foreground">Route</dt>
              <dd className="text-right">
                Buy on {VENUE_LABELS[evidence.buyOn]}, sell on {VENUE_LABELS[evidence.sellOn]}
              </dd>
            </>
          ) : null}
        </dl>
      ) : null}
      <p className="text-xs text-muted-foreground">{reason}</p>
      <p className="text-xs text-subtle">Pool fees and price impact are included; network fees are not.</p>
    </div>
  );
}

function RuleFacts({ rule }: { rule: Automation }) {
  const [a, b] = rule.config.venues;
  const facts: [string, string][] = [
    ['Pools', `${VENUE_LABELS[a]} vs ${VENUE_LABELS[b]} · XLM/USDC`],
    ['Trade size', `${rule.config.sizeUsdc} USDC`],
    ['Alert at', `${percent(rule.config.thresholdBps)} round-trip profit`],
    ['Cooldown', `${rule.config.cooldownMinutes} min`],
    ['Repeat', rule.config.mode === 'repeat' ? 'Every time the gap reopens' : 'Once, then stop'],
    ['Next check', rule.nextCheckAt ? clock(rule.nextCheckAt) : '—'],
    ['Last check', rule.lastEvaluatedAt ? `${clock(rule.lastEvaluatedAt)} · ${resultLabel(rule.lastResult)}` : '—'],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {facts.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function VenueSelect({ label, value, onChange }: { label: string; value: ArbVenue; onChange(venue: ArbVenue): void }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <Select
        value={value}
        onValueChange={(selected) => {
          const venue = ARB_VENUES.find((candidate) => candidate === selected);
          if (venue) onChange(venue);
        }}
      >
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue>{VENUE_LABELS[value]} · XLM/USDC</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {ARB_VENUES.map((venue) => (
            <SelectItem key={venue} value={venue}>
              {VENUE_LABELS[venue]} · XLM/USDC
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  hint: string;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value.trim())}
      />
      <p className="text-xs text-subtle">{hint}</p>
    </div>
  );
}

function ResultBadge({ result, preview = false }: { result: EvaluationResult; preview?: boolean }) {
  if (result === 'true') return <Badge>{preview ? 'Would alert now' : 'Gap open'}</Badge>;
  if (result === 'false') return <Badge variant="secondary">{preview ? 'Below threshold' : 'No gap'}</Badge>;
  return <Badge variant="outline">Unknown</Badge>;
}

function StatusBadge({ status }: { status: Automation['status'] }) {
  const label = { draft: 'Draft', active: 'Active', paused: 'Paused', completed: 'Completed' }[status];
  return <Badge variant={status === 'active' ? 'default' : 'outline'}>{label}</Badge>;
}

function resultLabel(result: EvaluationResult | null): string {
  if (result === 'true') return 'gap open';
  if (result === 'false') return 'no gap';
  if (result === 'unknown') return 'unknown';
  return 'not checked yet';
}

function clock(iso: string): string {
  return `${CLOCK.format(new Date(iso))} UTC`;
}

function compact(raw: string): string {
  return (Number(raw) / 1e7).toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 2 });
}

function messageOf(error: unknown): string {
  return error instanceof ExecutionRequestError || error instanceof Error ? error.message : 'Something went wrong.';
}
