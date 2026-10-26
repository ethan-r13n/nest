import { findVaultStrategy, parseVaultStrategies, type VaultStrategy } from '@nest/data/vault-strategies';
import { Card, CardContent, CardHeader, CardTitle } from '@nest/ui/components/card';

import contextJson from '../../../../research/data/vault-strategies.json' with { type: 'json' };
import { formatUtc } from '../lib/format.ts';
import { ProtocolLogo } from './protocol-logo.tsx';

const context = parseVaultStrategies(contextJson);
const CATEGORIES = ['Market', 'System', 'Execution'];

export function strategyFor(project: string, asset: string) {
  return findVaultStrategy(context, project, asset);
}

export function VaultStrategyMain({
  strategy,
  sources = context.sources,
  capturedAt = context.capturedAt,
  network = 'mainnet',
}: {
  strategy: VaultStrategy | undefined;
  sources?: Record<string, { label: string; url: string }>;
  capturedAt?: string;
  network?: 'mainnet' | 'testnet';
}) {
  if (!strategy) return null;
  const groups = CATEGORIES.map((category) => ({
    category,
    items: strategy.risks.filter((risk) => risk.category === category),
  })).filter((group) => group.items.length);
  return (
    <>
      {strategy.facts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <Facts rows={strategy.facts} />
          </CardContent>
        </Card>
      )}
      {groups.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Risk overview</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-3">
            {groups.map((group) => (
              <Card key={group.category} size="sm">
                <CardHeader>
                  <CardTitle className="text-sm text-destructive">{group.category} risks</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc space-y-3 pl-4 text-sm leading-relaxed text-muted-foreground">
                    {group.items.map((risk) => (
                      <li key={risk.text}>{risk.text}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
      {strategy.contracts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Contract addresses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {strategy.contracts.map((contract) => (
              <div key={contract.value}>
                <p className="mb-2 text-xs text-muted-foreground">{contract.label}</p>
                <a
                  className="break-all font-mono text-xs text-primary hover:underline"
                  href={`https://stellar.expert/explorer/${network === 'mainnet' ? 'public' : 'testnet'}/contract/${contract.value}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {contract.value} ↗
                </a>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <footer className="space-y-2 text-xs text-muted-foreground">
        <p>
          {strategy.scope === 'protocol' ? 'Protocol documentation' : 'Published product reference'} · checked{' '}
          {formatUtc(capturedAt)}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {strategy.sourceIds.map((id) => {
            const source = sources[id];
            return source ? (
              <a key={id} href={source.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                {source.label} ↗
              </a>
            ) : null;
          })}
        </div>
      </footer>
    </>
  );
}

export function VaultStrategyAside({ strategy }: { strategy: VaultStrategy | undefined }) {
  if (!strategy) return null;
  return (
    <>
      {strategy.counterparties.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Counterparties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {strategy.counterparties.map((party) => (
              <div key={party.name} className="flex items-center gap-3">
                <ProtocolLogo name={party.name} />
                <div>
                  <p className="text-sm font-medium">{party.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{party.role}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {strategy.fees.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Published fees</CardTitle>
          </CardHeader>
          <CardContent>
            <Facts rows={strategy.fees} />
          </CardContent>
        </Card>
      )}
    </>
  );
}

function Facts({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="vault-source-facts space-y-4">
      {rows.map((fact) => (
        <div key={fact.label} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <dt className="text-muted-foreground">{fact.label}</dt>
          <dd className="break-all">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
