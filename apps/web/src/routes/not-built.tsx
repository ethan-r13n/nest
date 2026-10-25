import { Badge } from '@nest/ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@nest/ui/components/card';

export interface NotBuiltPageProps {
  title: string;
  summary: string;
  stage: string;
}

export function NotBuiltPage({ title, summary, stage }: NotBuiltPageProps) {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-4xl font-semibold">{title}</h1>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            Not built yet <Badge variant="outline">{stage}</Badge>
          </CardTitle>
          <CardDescription>{summary}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Nothing on this page reads balances or moves funds yet.
        </CardContent>
      </Card>
    </section>
  );
}
