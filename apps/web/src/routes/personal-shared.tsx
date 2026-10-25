import { Button } from '@nest/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@nest/ui/components/card';
import { Label } from '@nest/ui/components/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@nest/ui/components/table';
import { Link } from '@tanstack/react-router';
import { type ReactNode, useId } from 'react';

import { EmptyState } from '../components/workspace.tsx';

const LAB_LINKS = [
  { to: '/lab/memory', label: 'Memory' },
  { to: '/lab/backtests', label: 'Backtests' },
  { to: '/lab/automations', label: 'Automations' },
] as const;

const PORTFOLIO_LINKS = [
  { to: '/portfolio', label: 'Overview' },
  { to: '/portfolio/activity', label: 'Activity' },
  { to: '/portfolio/receive', label: 'Receive' },
  { to: '/portfolio/send', label: 'Send' },
  { to: '/portfolio/spend', label: 'Spend' },
] as const;

export function PersonalNav({ area, active }: { area: 'lab' | 'portfolio'; active: string }) {
  const links = area === 'lab' ? LAB_LINKS : PORTFOLIO_LINKS;
  return (
    <nav
      aria-label={area === 'lab' ? 'Lab navigation' : 'Portfolio navigation'}
      className="flex flex-wrap gap-2 border-b pb-4"
    >
      {links.map((link) => (
        <Button
          nativeButton={false}
          key={link.to}
          variant={active === link.label ? 'secondary' : 'ghost'}
          render={<Link to={link.to} />}
        >
          {link.label}
        </Button>
      ))}
    </nav>
  );
}

export function PersonalField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
      {hint ? <p className="text-xs leading-relaxed text-subtle">{hint}</p> : null}
    </div>
  );
}

export function PersonalPanel({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function PersonalEmptyTable({
  headers,
  title,
  description,
}: {
  headers: string[];
  title: string;
  description: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {headers.map((header) => (
            <TableHead key={header}>{header}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell colSpan={headers.length} className="p-0">
            <EmptyState title={title} description={description} />
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

export function PersonalFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-4 border-b py-3 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-mono text-sm break-all">{value}</dd>
    </div>
  );
}
