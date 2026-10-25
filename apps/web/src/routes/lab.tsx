import { Badge } from '@nest/ui/components/badge';
import { Button } from '@nest/ui/components/button';
import { Input } from '@nest/ui/components/input';
import { Textarea } from '@nest/ui/components/textarea';
import { Link } from '@tanstack/react-router';
import { BookOpen, FileText, FlaskConical, Network, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { DraftNotice, EmptyState, PageHeader, StatCard } from '../components/workspace.tsx';
import { PersonalEmptyTable, PersonalFact, PersonalField, PersonalNav, PersonalPanel } from './personal-shared.tsx';

interface ConditionDraft {
  id: number;
  field: string;
  threshold: string;
}

export function MemoryPage() {
  const [view, setView] = useState('graph');
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Memory"
        kicker="Lab"
        description="Keep your research, preferences and decision notes in context. Memory never changes execution permissions."
        actions={
          <Button onClick={() => setEditing(true)}>
            <Plus /> New note draft
          </Button>
        }
      />
      <PersonalNav area="lab" active="Memory" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button
            variant={view === 'graph' ? 'secondary' : 'ghost'}
            aria-pressed={view === 'graph'}
            onClick={() => setView('graph')}
          >
            <Network /> Graph
          </Button>
          <Button
            variant={view === 'notes' ? 'secondary' : 'ghost'}
            aria-pressed={view === 'notes'}
            onClick={() => setView('notes')}
          >
            <BookOpen /> Notes
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled>
            Export memory
          </Button>
          <Button variant="outline" disabled>
            Reset memory
          </Button>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <PersonalPanel
          title={view === 'graph' ? 'Your research graph' : 'Your notes'}
          description="Notes and relationships appear after they have been loaded from your saved history."
        >
          <div className="flex min-h-80 flex-col justify-center rounded-lg border border-dashed">
            <EmptyState
              title="No memory loaded"
              description="Wallet sign-in and saved memory are not available in this build. No personal notes or inferred preferences have been loaded."
            />
          </div>
        </PersonalPanel>
        <PersonalPanel
          title={editing ? 'Unsaved note' : 'Note reader'}
          description={
            editing
              ? 'A local draft for this page. It is not stored or sent to the assistant.'
              : 'Choose a note to inspect its sources, links and accepted revision.'
          }
        >
          {editing ? (
            <div className="flex flex-col gap-4">
              <PersonalField label="Title">
                {(id) => (
                  <Input
                    id={id}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Research question or decision"
                  />
                )}
              </PersonalField>
              <PersonalField label="Note">
                {(id) => (
                  <Textarea
                    id={id}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    rows={8}
                    placeholder="Write your hypothesis, evidence or preferences…"
                  />
                )}
              </PersonalField>
              <DraftNotice>
                Unsaved draft. Leaving this page discards it. Saving requires verified wallet access.
              </DraftNotice>
              <div className="flex flex-wrap gap-2">
                <Button disabled>Save note</Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setTitle('');
                    setBody('');
                    setEditing(false);
                  }}
                >
                  Discard draft
                </Button>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No note selected"
              description="Sources, related records and accepted preferences will appear here when memory is available."
            />
          )}
        </PersonalPanel>
      </div>
      <PersonalPanel
        title="Preferences and permissions"
        description="Accepted research preferences can improve recommendations. Guardrails and wallet approvals remain separate."
      >
        <p className="text-sm text-muted-foreground">
          No preference proposal is awaiting review. Export and reset become available after your owned memory has
          loaded.
        </p>
      </PersonalPanel>
    </div>
  );
}

export function BacktestsPage() {
  const [strategy, setStrategy] = useState('');
  const [asset, setAsset] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [capital, setCapital] = useState('');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Backtests"
        kicker="Lab"
        description="Define a hypothesis, freeze the evidence and inspect results after costs. Historical replay is a deferred capability."
        actions={<Badge variant="outline">P1 · not available</Badge>}
      />
      <PersonalNav area="lab" active="Backtests" />
      <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <PersonalPanel title="Strategy draft" description="Describe the strategy before examining results.">
          <div className="flex flex-col gap-4">
            <PersonalField label="Hypothesis">
              {(id) => (
                <Textarea
                  id={id}
                  value={strategy}
                  onChange={(event) => setStrategy(event.target.value)}
                  rows={5}
                  placeholder="Define entry, exit, sizing and invalidation conditions…"
                />
              )}
            </PersonalField>
            <PersonalField label="Asset or pair">
              {(id) => (
                <Input
                  id={id}
                  value={asset}
                  onChange={(event) => setAsset(event.target.value)}
                  placeholder="Choose an asset or pair"
                />
              )}
            </PersonalField>
            <div className="grid grid-cols-2 gap-3">
              <PersonalField label="Start date">
                {(id) => <Input id={id} type="date" value={start} onChange={(event) => setStart(event.target.value)} />}
              </PersonalField>
              <PersonalField label="End date">
                {(id) => <Input id={id} type="date" value={end} onChange={(event) => setEnd(event.target.value)} />}
              </PersonalField>
            </div>
            <PersonalField label="Initial capital" hint="A draft amount; no funds are allocated.">
              {(id) => (
                <Input
                  id={id}
                  inputMode="decimal"
                  value={capital}
                  onChange={(event) => setCapital(event.target.value)}
                  placeholder="Enter amount and quote asset"
                />
              )}
            </PersonalField>
            <DraftNotice>
              No compatible historical execution dataset is available. Research totals cannot substitute for price,
              liquidity or rate history.
            </DraftNotice>
            <Button disabled>Run backtest</Button>
          </div>
        </PersonalPanel>
        <div className="flex min-w-0 flex-col gap-6">
          <PersonalPanel
            title="Equity and benchmark"
            description="Only completed, reproducible runs can populate this chart."
          >
            <div className="min-h-64 rounded-lg border border-dashed">
              <EmptyState
                title="No backtest results"
                description="No synthetic curve or invented trade history is shown. Results need a supported strategy and immutable historical data."
              />
            </div>
          </PersonalPanel>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Net return" value="—" detail="Not calculated" />
            <StatCard label="Maximum drawdown" value="—" detail="Not calculated" />
            <StatCard label="Costs" value="—" detail="Not calculated" />
          </div>
          <PersonalPanel title="Evidence and assumptions">
            <dl>
              <PersonalFact label="Dataset" value="Not selected" />
              <PersonalFact label="Spread and fees" value="Unavailable" />
              <PersonalFact label="Liquidity and rate coverage" value="Unavailable" />
              <PersonalFact label="Replay engine" value="Not available" />
            </dl>
          </PersonalPanel>
        </div>
      </div>
      <PersonalPanel title="Saved runs">
        <PersonalEmptyTable
          headers={['Run', 'Strategy', 'Dataset', 'Window', 'State']}
          title="No runs loaded"
          description="Completed runs will retain their parameters, dataset versions, event audit and cost assumptions."
        />
      </PersonalPanel>
    </div>
  );
}

export function BacktestDetailPage({ runId }: { runId: string }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Backtest run"
        kicker="Lab / Backtests"
        description="Inspect the exact strategy, dataset and assumptions behind a reproducible result."
        actions={
          <Button nativeButton={false} variant="outline" render={<Link to="/lab/backtests" />}>
            Back to backtests
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <PersonalPanel title="Run identity">
          <dl>
            <PersonalFact label="Requested run" value={runId} />
            <PersonalFact label="State" value="Not loaded" />
            <PersonalFact label="Dataset version" value="Unavailable" />
            <PersonalFact label="Parameter hash" value="Unavailable" />
          </dl>
        </PersonalPanel>
        <PersonalPanel title="Results">
          <EmptyState
            title="Run unavailable"
            description="This build cannot retrieve saved backtest runs. No return, fill or benchmark is inferred from the requested identifier."
          />
        </PersonalPanel>
      </div>
      <PersonalPanel title="Event audit">
        <PersonalEmptyTable
          headers={['Time', 'Signal', 'Action', 'Costs', 'Evidence']}
          title="No events loaded"
          description="The event audit will distinguish signals, later fills and rejected actions using the run’s frozen data."
        />
      </PersonalPanel>
    </div>
  );
}

export function AutomationsPage() {
  const [description, setDescription] = useState('');
  const [source, setSource] = useState('');
  const [action, setAction] = useState('notify');
  const [join, setJoin] = useState('all');
  const [cadence, setCadence] = useState('60');
  const [expiry, setExpiry] = useState('');
  const [conditions, setConditions] = useState<ConditionDraft[]>([{ id: 1, field: '', threshold: '' }]);
  const [nextId, setNextId] = useState(2);
  function updateCondition(id: number, key: 'field' | 'threshold', value: string) {
    setConditions((previous) =>
      previous.map((condition) => (condition.id === id ? { ...condition, [key]: value } : condition)),
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Automations"
        kicker="Lab"
        description="Turn an idea into conditions, evidence and an alert or reviewed proposal. You choose the rule; nothing executes unattended."
        actions={
          <Button nativeButton={false} variant="outline" render={<Link to="/settings/connections" />}>
            Connections
          </Button>
        }
      />
      <PersonalNav area="lab" active="Automations" />
      <div className="grid items-start gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
        <PersonalPanel title="Your rules">
          <EmptyState
            title="No rules loaded"
            description="Saved rules and their last evaluation appear after verified wallet access is available."
          />
        </PersonalPanel>
        <div className="flex min-w-0 flex-col gap-6">
          <PersonalPanel
            title="Describe your rule"
            description="Start with your own idea rather than a fixed strategy menu."
          >
            <PersonalField label="What should Nest monitor?">
              {(id) => (
                <Textarea
                  id={id}
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Describe a source, condition, time window and the action you want to review…"
                />
              )}
            </PersonalField>
          </PersonalPanel>
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,.8fr)]">
            <PersonalPanel title="Rule builder" description="Unresolved draft · not active">
              <div className="flex flex-col gap-5">
                <PersonalField
                  label="Source and field"
                  hint="Signal access has not been verified. A dated research snapshot is not a live monitoring feed."
                >
                  {(id) => (
                    <Input
                      id={id}
                      value={source}
                      onChange={(event) => setSource(event.target.value)}
                      placeholder="Describe the source you want to use"
                    />
                  )}
                </PersonalField>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold">Conditions</h3>
                  <div className="flex gap-1">
                    <Button
                      variant={join === 'all' ? 'secondary' : 'ghost'}
                      size="sm"
                      aria-pressed={join === 'all'}
                      onClick={() => setJoin('all')}
                    >
                      All
                    </Button>
                    <Button
                      variant={join === 'any' ? 'secondary' : 'ghost'}
                      size="sm"
                      aria-pressed={join === 'any'}
                      onClick={() => setJoin('any')}
                    >
                      Any
                    </Button>
                  </div>
                </div>
                {conditions.map((condition) => (
                  <div key={condition.id} className="flex flex-col gap-3 rounded-lg border p-3">
                    <PersonalField label="Condition">
                      {(id) => (
                        <Input
                          id={id}
                          value={condition.field}
                          onChange={(event) => updateCondition(condition.id, 'field', event.target.value)}
                          placeholder="Field, comparison and time window"
                        />
                      )}
                    </PersonalField>
                    <PersonalField
                      label="Threshold or event"
                      hint="Include the units and crossing direction where relevant."
                    >
                      {(id) => (
                        <Input
                          id={id}
                          value={condition.threshold}
                          onChange={(event) => updateCondition(condition.id, 'threshold', event.target.value)}
                          placeholder="Enter a value or event definition"
                        />
                      )}
                    </PersonalField>
                    {conditions.length > 1 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="self-start"
                        onClick={() => setConditions((previous) => previous.filter((item) => item.id !== condition.id))}
                      >
                        <Trash2 /> Remove condition
                      </Button>
                    ) : null}
                  </div>
                ))}
                <Button
                  variant="outline"
                  onClick={() => {
                    setConditions((previous) => [...previous, { id: nextId, field: '', threshold: '' }]);
                    setNextId((previous) => previous + 1);
                  }}
                >
                  <Plus /> Add condition
                </Button>
                <div className="flex flex-col gap-2">
                  <h3 className="font-semibold">When the rule matches</h3>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={action === 'notify' ? 'secondary' : 'outline'}
                      aria-pressed={action === 'notify'}
                      onClick={() => setAction('notify')}
                    >
                      Notify in Nest
                    </Button>
                    <Button
                      variant={action === 'propose' ? 'secondary' : 'outline'}
                      aria-pressed={action === 'propose'}
                      onClick={() => setAction('propose')}
                    >
                      Propose an action
                    </Button>
                  </div>
                  <p className="text-xs text-subtle">
                    A proposal still requires fresh comparison, review and your wallet signature.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <PersonalField label="Requested cadence · seconds">
                    {(id) => (
                      <Input
                        id={id}
                        inputMode="numeric"
                        value={cadence}
                        onChange={(event) => setCadence(event.target.value)}
                      />
                    )}
                  </PersonalField>
                  <PersonalField label="Expiry">
                    {(id) => (
                      <Input
                        id={id}
                        type="datetime-local"
                        value={expiry}
                        onChange={(event) => setExpiry(event.target.value)}
                      />
                    )}
                  </PersonalField>
                </div>
              </div>
            </PersonalPanel>
            <div className="flex min-w-0 flex-col gap-6">
              <PersonalPanel title="Before activation">
                <div className="flex flex-col gap-4">
                  <Badge variant="outline" className="self-start">
                    Unsaved draft · not active
                  </Badge>
                  <dl>
                    <PersonalFact label="Source access" value="Not verified" />
                    <PersonalFact
                      label="Condition matching"
                      value={join === 'all' ? 'All conditions' : 'Any condition'}
                    />
                    <PersonalFact label="Action" value={action === 'notify' ? 'Notify in Nest' : 'Reviewed proposal'} />
                    <PersonalFact label="Last evaluation" value="Not evaluated" />
                  </dl>
                  <DraftNotice>
                    No rule is saved, tested or scheduled from this page. Live signal access and verified ownership are
                    required first.
                  </DraftNotice>
                  <Button disabled>Test rule</Button>
                  <Button disabled>Save and activate</Button>
                </div>
              </PersonalPanel>
              <PersonalPanel title="Evaluation evidence">
                <EmptyState
                  title="Not evaluated"
                  description="True, false or unknown results must come from recorded observations. Missing source access is never treated as a match."
                />
              </PersonalPanel>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AutomationHistoryPage({ automationId }: { automationId: string }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Automation history"
        kicker="Lab / Automations"
        description="Inspect the accepted rule revision, evaluation evidence and linked proposals."
        actions={
          <Button nativeButton={false} variant="outline" render={<Link to="/lab/automations" />}>
            Open builder
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <PersonalPanel title="Rule identity">
          <dl>
            <PersonalFact label="Requested rule" value={automationId} />
            <PersonalFact label="Revision" value="Not loaded" />
            <PersonalFact label="State" value="Unavailable" />
            <PersonalFact label="Next evaluation" value="Unavailable" />
          </dl>
          <div className="mt-4 flex gap-2">
            <Button disabled>Pause</Button>
            <Button variant="outline" disabled>
              Resume
            </Button>
          </div>
        </PersonalPanel>
        <PersonalPanel title="Evaluation history">
          <PersonalEmptyTable
            headers={['Evaluated', 'Result', 'Evidence', 'Delivery']}
            title="No evaluations loaded"
            description="Rule history is not available in this build. No observation, match or trigger has been fabricated."
          />
        </PersonalPanel>
      </div>
      <PersonalPanel title="Action proposals">
        <EmptyState
          title="No proposals loaded"
          description="A matching rule can produce an expiring proposal. Reviewing it never bypasses fresh quotes, Guardrails or a wallet signature."
        />
      </PersonalPanel>
    </div>
  );
}

export function LearningPage() {
  const [objective, setObjective] = useState('');
  const [budget, setBudget] = useState('');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Learning runs"
        kicker="Lab"
        description="Review improvements proposed from recorded research, paper strategies and permitted simulations. Live funds are never an experiment."
        actions={<Badge variant="outline">P1 · not available</Badge>}
      />
      <PersonalNav area="lab" active="" />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <PersonalPanel title="Learning objective" description="A local draft only; no experiment starts here.">
          <div className="flex flex-col gap-4">
            <PersonalField label="What should improve?">
              {(id) => (
                <Textarea
                  id={id}
                  value={objective}
                  onChange={(event) => setObjective(event.target.value)}
                  rows={5}
                  placeholder="Describe a research or recommendation task to evaluate…"
                />
              )}
            </PersonalField>
            <PersonalField
              label="Experiment budget"
              hint="Scope, read access, runtime and model limits need explicit review."
            >
              {(id) => (
                <Input
                  id={id}
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                  placeholder="Describe limits for a future run"
                />
              )}
            </PersonalField>
            <DraftNotice>
              No recorded-task catalog or experiment runner is connected. A learning proposal cannot modify Guardrails,
              signing permissions or execution code.
            </DraftNotice>
            <Button disabled>
              <FlaskConical /> Start learning run
            </Button>
          </div>
        </PersonalPanel>
        <PersonalPanel title="Reviewed proposals">
          <EmptyState
            title="No learning proposals"
            description="A completed experiment must retain its evidence, versioned changes and regression results before a person can approve it."
          />
        </PersonalPanel>
      </div>
      <PersonalPanel title="Experiment boundaries">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              title: 'Recorded evidence',
              body: 'Use frozen research, simulated or backtested tasks with known coverage.',
            },
            { title: 'Versioned proposals', body: 'Show the precise recommendation or prompt changes for review.' },
            {
              title: 'Explicit acceptance',
              body: 'A learning result never expands spending or execution permissions.',
            },
          ].map((item) => (
            <div key={item.title} className="space-y-2">
              <FileText className="size-4 text-subtle" aria-hidden="true" />
              <h3 className="text-base font-semibold">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </PersonalPanel>
    </div>
  );
}
