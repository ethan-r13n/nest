import { Button } from '@nest/ui/components/button';
import { Card } from '@nest/ui/components/card';
import { Separator } from '@nest/ui/components/separator';
import { Link } from '@tanstack/react-router';
import { ArrowUpRight, BookOpen, Clock3, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react';
import { useState } from 'react';

import { ConversationDraft } from '../components/conversation-draft.tsx';
import { PageHeader } from '../components/workspace.tsx';
import { useWorkspaceSession } from '../components/workspace-session.tsx';

const HISTORY_LINKS = [
  { to: '/lab/memory', label: 'Memory', icon: BookOpen },
  { to: '/portfolio/activity', label: 'Action history', icon: Clock3 },
  { to: '/research/markets', label: 'Market coverage', icon: ArrowUpRight },
] as const;

export function ChatPage() {
  const { setDraft, chat } = useWorkspaceSession();
  const [expanded, setExpanded] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  return (
    <div
      className={`grid h-[calc(100svh-10rem)] min-h-[28rem] min-w-0 gap-6 ${expanded ? 'lg:grid-cols-[220px_minmax(0,1fr)]' : 'lg:grid-cols-[52px_minmax(0,1fr)]'}`}
    >
      <aside className="min-w-0 lg:border-r lg:pr-3" aria-label="Conversation history">
        <div className={`flex items-center gap-2 ${expanded ? 'justify-between' : 'lg:flex-col'}`}>
          <Button
            variant="ghost"
            className="min-h-11"
            size="icon"
            aria-label={expanded ? 'Collapse conversation history' : 'Expand conversation history'}
            aria-expanded={expanded}
            aria-controls="conversation-history"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <PanelLeftClose /> : <PanelLeftOpen />}
          </Button>
          <Button
            variant="ghost"
            className="min-h-11"
            size="icon"
            aria-label="New conversation"
            title="New conversation"
            onClick={() => {
              setDraft('');
              chat.reset();
            }}
          >
            <Plus />
          </Button>
        </div>
        <div
          id="conversation-history"
          className={`${expanded ? 'flex' : 'hidden lg:flex'} min-w-0 flex-col gap-3 pt-3`}
        >
          {expanded ? (
            <>
              <h2 className="font-sans text-xs font-medium uppercase tracking-wider text-subtle">Conversations</h2>
              <Card className="gap-1 p-3">
                <p className="text-sm font-medium">Current conversation</p>
                <p className="text-xs text-subtle">Guest · not saved</p>
              </Card>
              <Separator />
            </>
          ) : null}
          {HISTORY_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              aria-label={link.label}
              title={link.label}
              className="flex min-h-11 min-w-11 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <link.icon className="size-4 shrink-0" />
              {expanded ? link.label : <span className="sr-only">{link.label}</span>}
            </Link>
          ))}
          {expanded ? (
            <p className="hidden text-xs leading-relaxed text-subtle lg:block">
              Saved conversations require wallet sign-in. This conversation only stays in the current session.
            </p>
          ) : null}
        </div>
      </aside>
      <section className="flex min-h-0 min-w-0 flex-col gap-5">
        <PageHeader
          title="Ask Nest"
          description="One workspace for researching Stellar DeFi and reviewing your next move."
        />
        <ConversationDraft />
      </section>
    </div>
  );
}
