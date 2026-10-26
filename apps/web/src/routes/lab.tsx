import { Badge } from '@nest/ui/components/badge';
import { Button } from '@nest/ui/components/button';
import { Input } from '@nest/ui/components/input';
import { Textarea } from '@nest/ui/components/textarea';
import { Link } from '@tanstack/react-router';
import { FileText, FlaskConical } from 'lucide-react';
import { useState } from 'react';
import { ArbitrageBuilder, AutomationDetail, AutomationList } from '../components/arbitrage-monitor.tsx';
import { ConversationDraft } from '../components/conversation-draft.tsx';
import { DraftNotice, EmptyState, PageHeader } from '../components/workspace.tsx';
import { useWorkspaceSession } from '../components/workspace-session.tsx';
import { PersonalEmptyTable, PersonalFact, PersonalField, PersonalNav, PersonalPanel } from './personal-shared.tsx';

export function MemoryPage() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="lab-workspace flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Your strategies, in view."
        kicker="Nest / Lab"
        description="Revisit the idea, inspect its evidence, and follow each evaluation."
      />
      <PersonalNav area="lab" active="History" />
      <PersonalPanel title="Automation history" description="Saved monitor rules and their actual evaluation records.">
        <AutomationList selectedId={selected} onSelect={setSelected} />
      </PersonalPanel>
      {selected ? (
        <PersonalPanel title="Monitor evidence">
          <AutomationDetail id={selected} onDeleted={() => setSelected(null)} />
        </PersonalPanel>
      ) : null}
      <PersonalPanel title="Backtest history">
        <PersonalEmptyTable
          headers={['Thesis', 'Asset / pair', 'Window', 'State', 'Evidence']}
          title="No completed backtests"
          description="Historical replay is not connected. A saved idea is not a completed backtest or a measured return."
        />
      </PersonalPanel>
    </div>
  );
}

export function BacktestsPage() {
  const { chat, setDraft } = useWorkspaceSession();
  return (
    <div className="lab-workspace flex min-w-0 flex-col gap-6">
      <PageHeader
        title="From thesis to strategy."
        kicker="Nest / Lab"
        description="Describe an idea. Test it against the past, or watch for it in the future."
      />
      <PersonalNav area="lab" active="Backtest" />
      <section className="workspace-panel" aria-labelledby="strategy-chat-title">
        <div className="flex items-center justify-between gap-4 border-b px-6 py-4">
          <h2 id="strategy-chat-title" className="text-sm">
            <span className="mr-2 text-primary" aria-hidden="true">
              ●
            </span>{' '}
            Strategy chat <span className="ml-3 font-mono text-[10px] text-subtle">Backtest</span>
          </h2>
          <Button
            variant="outline"
            className="workspace-action"
            disabled={chat.running}
            onClick={() => {
              chat.reset();
              setDraft('');
            }}
          >
            New thesis
          </Button>
        </div>
        <div className="flex h-[min(680px,75vh)] min-h-[480px] flex-col p-5 sm:p-6">
          <ConversationDraft purpose="strategy" />
        </div>
      </section>
      <PersonalPanel
        title="Before you confirm"
        description="A thesis needs a supported dataset and replay engine before a backtest can run."
      >
        <p className="text-sm leading-7 text-muted-foreground">
          Historical replay remains a deferred capability. Nest can help refine the entry, exit, sizing and invalidation
          conditions; it cannot provide an invented equity curve or measured performance.
        </p>
        <Button disabled className="workspace-action mt-5">
          Confirm backtest
        </Button>
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
  const [selected, setSelected] = useState<string | null>(null);
  const { chat, setDraft } = useWorkspaceSession();
  return (
    <div className="lab-workspace flex min-w-0 flex-col gap-6">
      <PageHeader
        title="From thesis to strategy."
        kicker="Nest / Lab"
        description="Describe an idea. Test it against the past, or watch for it in the future."
        actions={
          <Button
            nativeButton={false}
            variant="outline"
            className="workspace-action"
            render={<Link to="/settings/connections" />}
          >
            Connections
          </Button>
        }
      />
      <PersonalNav area="lab" active="Set automation" />
      <section className="workspace-panel" aria-labelledby="automation-chat-title">
        <div className="flex items-center justify-between gap-4 border-b px-6 py-4">
          <h2 id="automation-chat-title" className="text-sm">
            <span className="mr-2 text-primary" aria-hidden="true">
              ●
            </span>{' '}
            Strategy chat <span className="ml-3 font-mono text-[10px] text-subtle">Automation</span>
          </h2>
          <Button
            variant="outline"
            className="workspace-action"
            disabled={chat.running}
            onClick={() => {
              chat.reset();
              setDraft('');
            }}
          >
            New thesis
          </Button>
        </div>
        <div className="flex h-[min(600px,70vh)] min-h-[460px] flex-col p-5 sm:p-6">
          <ConversationDraft purpose="strategy" />
        </div>
      </section>
      <PersonalPanel
        title="Configure your monitor"
        description="The connected rule type watches XLM/USDC price divergence. Live preview, draft, explicit activation and evaluation evidence use the existing monitoring service."
      >
        <ArbitrageBuilder onActivated={setSelected} />
      </PersonalPanel>
      {selected ? (
        <PersonalPanel title="Monitor evidence">
          <AutomationDetail id={selected} onDeleted={() => setSelected(null)} />
        </PersonalPanel>
      ) : null}
      <PersonalPanel title="Your monitors">
        <AutomationList selectedId={selected} onSelect={setSelected} />
      </PersonalPanel>
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
      <PersonalPanel title="Monitor">
        <AutomationDetail id={automationId} />
      </PersonalPanel>
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
