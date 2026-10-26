import { Badge } from '@nest/ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@nest/ui/components/card';
import { CircleDashed, Info } from 'lucide-react';
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  kicker,
  actions,
  icon,
}: {
  title: string;
  description: string;
  kicker?: string;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <header className="workspace-page-header flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-2">
        {kicker ? <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-subtle">{kicker}</p> : null}
        <h1 className={`text-3xl font-semibold tracking-tight sm:text-4xl ${icon ? 'flex items-center gap-3' : ''}`}>
          {icon}
          {title}
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {actions}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center gap-3 px-5 py-8 text-center">
      <CircleDashed className="size-6 text-subtle" aria-hidden="true" />
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}

export function DraftNotice({ children }: { children?: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>{children ?? 'Unsaved draft only. Nothing is submitted or executed from this form.'}</p>
    </div>
  );
}

export function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <Card size="sm" className="workspace-stat">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-mono text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {detail ? <CardContent className="text-xs text-subtle">{detail}</CardContent> : null}
    </Card>
  );
}

export function UnavailableBadge() {
  return <Badge variant="outline">Not connected</Badge>;
}
