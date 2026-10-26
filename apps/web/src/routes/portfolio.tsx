import { Badge } from '@nest/ui/components/badge';
import { Button } from '@nest/ui/components/button';
import { Input } from '@nest/ui/components/input';
import { Link } from '@tanstack/react-router';
import { ArrowDownLeft, ArrowUpRight, Bell, CreditCard, Download } from 'lucide-react';
import { useState } from 'react';

import { ProtocolLogo } from '../components/protocol-logo.tsx';
import { DraftNotice, EmptyState, PageHeader, UnavailableBadge } from '../components/workspace.tsx';
import { useHealth } from '../lib/health.ts';
import { PersonalEmptyTable, PersonalFact, PersonalField, PersonalNav, PersonalPanel } from './personal-shared.tsx';

const ACTIVITY_FILTERS = ['All', 'Trades', 'Credit', 'Vaults', 'Transfers'] as const;
const ALERT_FILTERS = ['All', 'Risk', 'Market', 'Workflow', 'Source'] as const;

export function PortfolioPage() {
  const [allocationView, setAllocationView] = useState('mix');
  return (
    <div className="portfolio-workspace flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Your Portfolio"
        kicker="Wallet"
        description="Balances and positions, with direct access to each market."
      />
      <PersonalNav area="portfolio" active="Overview" />
      <section className="workspace-panel" aria-labelledby="portfolio-composition-title">
        <div className="flex flex-wrap items-center justify-between gap-5 border-b p-6">
          <div>
            <h2 id="portfolio-composition-title" className="font-serif text-[22px] font-semibold">
              Portfolio composition
            </h2>
            <p className="my-2 font-mono text-[38px] leading-tight text-subtle">—</p>
            <p className="text-[11px] text-subtle">Net portfolio value · valuation unavailable</p>
          </div>
          <fieldset aria-label="Portfolio allocation view" className="flex gap-2">
            <Button
              className="workspace-action"
              variant={allocationView === 'mix' ? 'outline' : 'ghost'}
              aria-pressed={allocationView === 'mix'}
              onClick={() => setAllocationView('mix')}
            >
              Asset mix
            </Button>
            <Button
              className="workspace-action"
              variant={allocationView === 'net' ? 'outline' : 'ghost'}
              aria-pressed={allocationView === 'net'}
              onClick={() => setAllocationView('net')}
            >
              Net value
            </Button>
          </fieldset>
        </div>
        <div className="p-6">
          <p className="mb-5 text-xs text-subtle">
            {allocationView === 'mix'
              ? 'Gross assets · receipt backing is counted once'
              : 'Net value = gross assets − debt'}
          </p>
          <div className="mb-6 flex min-h-8 items-center rounded-lg border border-dashed px-3 text-xs text-subtle">
            Composition requires verified balances and prices.
          </div>
          <dl className="grid gap-5 sm:grid-cols-3">
            {(allocationView === 'mix'
              ? ['Wallet', 'Direct supply', 'Vault receipts']
              : ['Gross assets', 'Less debt', 'Net value']
            ).map((label) => (
              <div key={label} className="border-l-2 pl-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="my-2 font-mono text-2xl text-subtle">—</dd>
                <p className="text-[11px] text-subtle">Valuation unavailable</p>
              </div>
            ))}
          </dl>
        </div>
        <p className="border-t px-6 py-4 text-xs leading-6 text-muted-foreground">
          Performance needs confirmed history and cost basis. P&amp;L and historical performance remain unavailable.
        </p>
      </section>
      <PersonalPanel
        title="Positions & exits"
        description="Manage each position with its identity, ownership and exit conditions preserved."
      >
        <PersonalEmptyTable
          headers={['Position', 'Value', 'Accounting', 'Manage']}
          title="No verified positions loaded"
          description="Wallet assets, collateral, debt and vault receipts need confirmed position reads before appearing here. Missing data is not a zero balance."
        />
        <div className="mt-4 flex flex-wrap gap-4">
          <Link to="/credit/positions" className="inline-flex min-h-11 items-center text-sm text-primary">
            Manage credit positions <ArrowUpRight className="ml-2 size-4" />
          </Link>
          <Link to="/earn" className="inline-flex min-h-11 items-center text-sm text-primary">
            Explore supply and vaults <ArrowUpRight className="ml-2 size-4" />
          </Link>
        </div>
      </PersonalPanel>
      <PersonalPanel title="Activity">
        <PersonalEmptyTable
          headers={['Action', 'Amount', 'State']}
          title="No verified activity loaded"
          description="Action history requires confirmed account records. No sample receipts appear as personal activity."
        />
        <Button nativeButton={false} variant="ghost" className="mt-3" render={<Link to="/portfolio/activity" />}>
          All activity ↗
        </Button>
      </PersonalPanel>
      <nav aria-label="Wallet actions">
        <div className="flex flex-wrap gap-2">
          <Button
            nativeButton={false}
            variant="outline"
            className="workspace-action"
            render={<Link to="/portfolio/receive" />}
          >
            <ArrowDownLeft /> Receive
          </Button>
          <Button
            nativeButton={false}
            variant="outline"
            className="workspace-action"
            render={<Link to="/portfolio/send" />}
          >
            <ArrowUpRight /> Send
          </Button>
          <Button
            nativeButton={false}
            variant="outline"
            className="workspace-action"
            render={<Link to="/portfolio/spend" />}
          >
            <CreditCard /> Spend preview
          </Button>
        </div>
      </nav>
    </div>
  );
}

export function ReceivePage() {
  const health = useHealth();
  const network =
    health.isSuccess && health.data.ok ? (health.data.network === 'mainnet' ? 'Mainnet' : 'Testnet') : 'Unavailable';
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Receive assets"
        kicker="Portfolio"
        description="Check the destination, network and asset requirements before funding your wallet."
      />
      <PersonalNav area="portfolio" active="Receive" />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <PersonalPanel
          title="Your receiving details"
          description="Receiving information appears only after a wallet has been selected."
        >
          <div className="flex flex-col gap-4">
            <dl>
              <PersonalFact label="Network" value={network} />
              <PersonalFact label="Address" value="Not loaded" />
              <PersonalFact label="Memo" value="Not determined" />
            </dl>
            <div className="min-h-48 rounded-lg border border-dashed">
              <EmptyState
                title="No receiving address"
                description="A real address and any required memo must be verified before a QR code or copy action is available."
              />
            </div>
            <Button disabled>Copy address</Button>
          </div>
        </PersonalPanel>
        <div className="flex flex-col gap-6">
          <PersonalPanel title="Before you transfer">
            <ul className="list-disc space-y-3 pl-5 text-sm text-muted-foreground">
              <li>Use the same Stellar network as the receiving wallet.</li>
              <li>Check the asset issuer and any authorization requirements.</li>
              <li>Confirm any required memo with the receiving provider.</li>
              <li>Keep enough XLM for applicable reserves and network fees.</li>
            </ul>
          </PersonalPanel>
          <PersonalPanel title="Funding options">
            <EmptyState
              title="No provider selected"
              description="Supported provider links and arrival verification will appear when funding access is available. No transfer has been requested."
            />
          </PersonalPanel>
        </div>
      </div>
    </div>
  );
}

export function SendPage() {
  const [asset, setAsset] = useState('');
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [memo, setMemo] = useState('');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Send assets"
        kicker="Portfolio"
        description="Draft a transfer, then inspect the exact recipient, asset and maximum fees before signing."
      />
      <PersonalNav area="portfolio" active="Send" />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <PersonalPanel title="Transfer draft" description="No balance has been loaded and no transaction is prepared.">
          <div className="flex flex-col gap-5">
            <PersonalField label="Asset" hint="The exact Stellar asset identity must be resolved before review.">
              {(id) => (
                <Input
                  id={id}
                  value={asset}
                  onChange={(event) => setAsset(event.target.value)}
                  placeholder="Asset code and issuer"
                />
              )}
            </PersonalField>
            <PersonalField label="Amount">
              {(id) => (
                <Input
                  id={id}
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="Enter an amount"
                />
              )}
            </PersonalField>
            <PersonalField label="Recipient">
              {(id) => (
                <Input
                  id={id}
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                  placeholder="Stellar destination address"
                  autoComplete="off"
                />
              )}
            </PersonalField>
            <PersonalField label="Memo · if required" hint="The destination and memo must be inspected together.">
              {(id) => (
                <Input
                  id={id}
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                  placeholder="Enter the receiving provider’s required memo"
                />
              )}
            </PersonalField>
            <DraftNotice>
              Unsaved transfer draft only. Current balances, recipient requirements and a fee preview must be available
              before review.
            </DraftNotice>
            <div className="flex flex-wrap gap-2">
              <Button disabled>Review transfer</Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setAsset('');
                  setAmount('');
                  setDestination('');
                  setMemo('');
                }}
              >
                Clear draft
              </Button>
            </div>
          </div>
        </PersonalPanel>
        <PersonalPanel title="Transfer preview">
          <dl>
            <PersonalFact label="Available balance" value="Unavailable" />
            <PersonalFact label="Recipient inspection" value="Not checked" />
            <PersonalFact label="Maximum fees" value="Unavailable" />
            <PersonalFact label="Remaining reserve" value="Unavailable" />
          </dl>
          <p className="mt-4 text-sm text-muted-foreground">
            Nothing is submitted from a draft. Your wallet approves a specific prepared transaction only after review.
          </p>
        </PersonalPanel>
      </div>
    </div>
  );
}

export function ActivityPage() {
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Action history"
        kicker="Portfolio"
        description="Inspect actions, their actual outcomes and the plan revision you approved."
        actions={
          <Button variant="outline" disabled>
            <Download /> Export activity
          </Button>
        }
      />
      <PersonalNav area="portfolio" active="Activity" />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-1">
          {ACTIVITY_FILTERS.map((item) => (
            <Button
              key={item}
              variant={filter === item ? 'secondary' : 'ghost'}
              aria-pressed={filter === item}
              onClick={() => setFilter(item)}
            >
              {item}
            </Button>
          ))}
        </div>
        <div className="w-full sm:max-w-xs">
          <PersonalField label="Search activity">
            {(id) => (
              <Input
                id={id}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Action, asset or venue"
              />
            )}
          </PersonalField>
        </div>
      </div>
      <PersonalPanel title={filter === 'All' ? 'All activity' : filter}>
        <PersonalEmptyTable
          headers={['Time', 'Action', 'Venue', 'Amount', 'State', 'Receipt']}
          title="No activity loaded"
          description="History requires verified wallet access and actual action records. No values or transaction identifiers are invented."
        />
      </PersonalPanel>
    </div>
  );
}

export function PlanStatusPage({ planId }: { planId: string }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Plan status"
        kicker="Activity"
        description="Track the reviewed plan, signatures, settlement and confirmed effects without losing the original action context."
        actions={
          <Button nativeButton={false} variant="outline" render={<Link to="/portfolio/activity" />}>
            Back to activity
          </Button>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <PersonalPanel title="Action timeline">
            <EmptyState
              title="Plan not loaded"
              description="This build cannot retrieve the requested plan. Its status, amounts, signatures and receipts remain unavailable."
            />
            <div className="flex flex-wrap gap-2 border-t pt-4">
              {['Review', 'Wallet signature', 'Submission', 'Settlement', 'Confirmed effects'].map((label) => (
                <Badge key={label} variant="outline">
                  {label}
                </Badge>
              ))}
            </div>
            <p className="mt-3 text-xs text-subtle">These are lifecycle stages, not completed steps for this plan.</p>
          </PersonalPanel>
          <PersonalPanel title="Confirmed effects">
            <PersonalEmptyTable
              headers={['Asset or position', 'Actual change', 'Evidence']}
              title="No confirmed effects loaded"
              description="A submission acknowledgement is not confirmation. Partial completion and external settlement retain their actual receipts."
            />
          </PersonalPanel>
        </div>
        <PersonalPanel title="Plan identity">
          <dl>
            <PersonalFact label="Requested plan" value={planId} />
            <PersonalFact label="Revision" value="Unavailable" />
            <PersonalFact label="Policy version" value="Unavailable" />
            <PersonalFact label="Expiry" value="Unavailable" />
            <PersonalFact label="Transaction hash" value="Unavailable" />
          </dl>
          <div className="mt-4 flex flex-col gap-2">
            <Button disabled>Review next action</Button>
            <Button variant="outline" disabled>
              Cancel unapproved plan
            </Button>
          </div>
          <p className="mt-4 text-xs text-subtle">
            Recovery needs a fresh reviewed action. A submitted transaction cannot be cancelled by closing a page.
          </p>
        </PersonalPanel>
      </div>
    </div>
  );
}

export function AlertsPage() {
  const [filter, setFilter] = useState('All');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Alerts"
        description="Review risk, market, workflow and source changes alongside the evidence that raised them."
        actions={
          <Button variant="outline" disabled>
            Mark all read
          </Button>
        }
      />
      <div className="flex flex-wrap gap-2">
        {ALERT_FILTERS.map((item) => (
          <Button
            key={item}
            variant={filter === item ? 'secondary' : 'ghost'}
            aria-pressed={filter === item}
            onClick={() => setFilter(item)}
          >
            {item}
          </Button>
        ))}
      </div>
      <PersonalPanel title={filter === 'All' ? 'Your alerts' : `${filter} alerts`}>
        <EmptyState
          title="No alerts loaded"
          description="Alert history is unavailable until verified wallet access and monitoring are connected. An unread count is not inferred."
        >
          <Bell className="size-5 text-subtle" aria-hidden="true" />
        </EmptyState>
      </PersonalPanel>
      <DraftNotice>
        Reading or acknowledging an alert never signs a transaction, changes Guardrails or activates an automation.
      </DraftNotice>
    </div>
  );
}

export function ConnectionsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Connections"
        kicker="Workspace / Sources"
        description="See granted access, health, entitlement and dependent rules."
        actions={
          <Button nativeButton={false} variant="outline" render={<Link to="/lab/memory" />}>
            Strategy history
          </Button>
        }
      />
      <div className="grid gap-6 md:grid-cols-2">
        <PersonalPanel
          title="X / social read access"
          description="Official account authorization · no financial authority"
        >
          <div className="mb-5 flex items-center gap-3">
            <ProtocolLogo name="X" />
            <span className="text-sm font-medium">X</span>
          </div>
          <dl>
            <PersonalFact label="Connection" value={<UnavailableBadge />} />
            <PersonalFact label="Granted scopes" value="Not loaded" />
            <PersonalFact label="Entitled datasets" value="Unavailable until access is configured" />
            <PersonalFact label="Cadence / quota" value="Provider and application dependent" />
            <PersonalFact label="Dependent rules" value="Not loaded" />
          </dl>
          <Button className="mt-5" disabled>
            Connect X
          </Button>
        </PersonalPanel>
        <PersonalPanel title="Market & protocol sources">
          <dl>
            <PersonalFact label="Stellar RPC" value="Network-specific chain reads" />
            <PersonalFact label="Venue quotes" value="Verified for each requested action" />
            <PersonalFact label="DefiLlama" value="Dated public snapshot" />
            <PersonalFact label="RWA.xyz" value="Dated public snapshot" />
            <PersonalFact label="Raven" value="Connection status unavailable" />
            <PersonalFact label="Secrets" value="Never exposed in client UI" />
          </dl>
          <Button nativeButton={false} variant="outline" className="mt-5" render={<Link to="/research" />}>
            Inspect research
          </Button>
        </PersonalPanel>
      </div>
      <PersonalPanel title="Dependent automations">
        <EmptyState
          title="No dependency history loaded"
          description="Connection access and activation remain separate. Verified dependent rules appear here when account authorization is connected."
        />
      </PersonalPanel>
    </div>
  );
}

export function SpendPage() {
  const [previewOpen, setPreviewOpen] = useState(false);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Spend your USDC"
        kicker="Portfolio / Rain card concept"
        description="Explore a card experience alongside your Stellar portfolio."
        actions={<Badge variant="outline">UI preview only</Badge>}
      />
      <PersonalNav area="portfolio" active="Spend" />
      <div className="grid overflow-hidden rounded-xl border bg-card lg:grid-cols-2">
        <div className="flex flex-col items-center justify-center gap-8 bg-secondary p-6 sm:p-10">
          <div
            className="flex aspect-[1.586] w-full max-w-sm flex-col justify-between overflow-hidden rounded-2xl border bg-background p-6"
            role="img"
            aria-label="Masked Nest card concept, not issued"
          >
            <div className="flex items-center justify-between gap-4">
              <span className="font-serif text-3xl font-semibold text-primary">Nest</span>
              <span className="font-mono text-xs text-subtle">STELLAR · USDC</span>
            </div>
            <div>
              <div className="mb-4 h-6 w-9 rounded bg-muted" />
              <p className="font-mono text-lg tracking-wider" aria-hidden="true">
                •••• •••• •••• ••••
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 font-mono text-xs text-subtle">
              <span>Card concept</span>
              <span>Not issued</span>
            </div>
          </div>
          <div className="w-full max-w-sm">
            <dl>
              <PersonalFact label="Wallet USDC" value="Not loaded" />
              <PersonalFact label="Card available balance" value="Not connected" />
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-subtle">
              Supply, collateral and vault positions are separate from card spending power. No card has been funded.
            </p>
          </div>
        </div>
        <div className="flex flex-col justify-center gap-6 p-6 sm:p-10">
          <div className="space-y-3">
            <p className="font-mono text-xs uppercase tracking-wider text-subtle">Rain card preview</p>
            <h2 className="text-3xl font-semibold">A card beside your portfolio.</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              This concept shows the proposed setup experience. Availability, eligibility and funding depend on a future
              supported card program.
            </p>
          </div>
          <ol className="space-y-5">
            {[
              { title: 'Connect your wallet', detail: 'Load your actual Stellar wallet context.' },
              {
                title: 'Check eligibility and verify identity',
                detail: 'A provider flow would confirm access and requirements.',
              },
              { title: 'Create and fund your card', detail: 'No issuance or funding is connected here.' },
              { title: 'Spend USDC', detail: 'Card availability and terms must be verified first.' },
            ].map((step, index) => (
              <li key={step.title} className="flex items-start gap-3">
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-xs text-muted-foreground"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-sans text-base font-medium">{step.title}</h3>
                  <p className="mt-1 text-xs text-subtle">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          <Button
            aria-expanded={previewOpen}
            aria-controls="spend-setup-preview"
            onClick={() => setPreviewOpen((previous) => !previous)}
          >
            {previewOpen ? 'Close setup preview' : 'Preview card setup'}
          </Button>
          {previewOpen ? (
            <div
              id="spend-setup-preview"
              className="rounded-lg border p-4 text-sm leading-relaxed text-muted-foreground"
              aria-live="polite"
            >
              A live version would open the provider’s eligibility and identity flow, followed by issuance and verified
              funding. This preview collects no personal information, creates no card and moves no funds.
            </div>
          ) : null}
          <p className="text-xs text-subtle">
            UI concept only. No card credentials, identity uploads, terms acceptance or payments are handled here.
          </p>
        </div>
      </div>
    </div>
  );
}
