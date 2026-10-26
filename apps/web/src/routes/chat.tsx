import { Button } from '@nest/ui/components/button';
import { Separator } from '@nest/ui/components/separator';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@nest/ui/components/sheet';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowUpRight,
  BookOpen,
  Clock3,
  LockKeyhole,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { ConversationDraft } from '../components/conversation-draft.tsx';
import { PageHeader } from '../components/workspace.tsx';
import { useWorkspaceSession } from '../components/workspace-session.tsx';

const HISTORY_LINKS = [
  { to: '/lab/memory', label: 'Memory', icon: BookOpen },
  { to: '/portfolio/activity', label: 'Action history', icon: Clock3 },
  { to: '/research/markets', label: 'Market coverage', icon: ArrowUpRight },
] as const;

/** `ask` is a question carried from the landing page; it fills the composer once and is not sent. */
export function ChatPage({ ask }: { ask?: string | undefined }) {
  const { setDraft, chat } = useWorkspaceSession();
  const [expanded, setExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!ask) return;
    setDraft(ask);
    void navigate({ to: '/chat', search: {}, replace: true });
  }, [ask, setDraft, navigate]);

  function newConversation() {
    setDraft('');
    chat.reset();
  }

  return (
    <div
      className={`grid h-full min-h-0 min-w-0 gap-6 lg:gap-8 ${expanded ? 'lg:grid-cols-[224px_minmax(0,1fr)]' : 'lg:grid-cols-[52px_minmax(0,1fr)]'}`}
    >
      <aside
        className={`hidden min-h-0 min-w-0 flex-col border-r lg:flex ${expanded ? 'pr-5' : 'pr-2'}`}
        aria-label="Conversation history"
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => {
          if (!pinned) setExpanded(false);
        }}
        onFocusCapture={() => setExpanded(true)}
        onBlurCapture={(event) => {
          if (!pinned && !event.currentTarget.contains(event.relatedTarget)) setExpanded(false);
        }}
      >
        <div className={`mb-4 flex items-center gap-2 ${expanded ? 'justify-between' : 'flex-col'}`}>
          {expanded ? (
            <h2 className="font-sans text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Conversations
            </h2>
          ) : null}
          <Button
            variant="ghost"
            className="size-11 text-muted-foreground"
            size="icon"
            aria-label={expanded ? 'Collapse conversation history' : 'Expand conversation history'}
            aria-expanded={expanded}
            aria-controls="conversation-history"
            onClick={() => {
              setPinned(!pinned);
              setExpanded(!pinned);
            }}
          >
            {expanded ? <PanelLeftClose /> : <PanelLeftOpen />}
          </Button>
        </div>
        <Button
          variant="outline"
          className={`mb-6 min-h-11 gap-2 bg-transparent dark:bg-transparent ${expanded ? 'w-full justify-start px-3' : 'size-11'}`}
          aria-label="New conversation"
          title="New conversation"
          onClick={newConversation}
        >
          <Plus />
          {expanded ? 'New conversation' : null}
        </Button>
        <div id="conversation-history" className="flex min-h-0 flex-1 flex-col">
          <HistoryContents expanded={expanded} />
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col gap-4 sm:gap-5">
        <div className="relative w-full shrink-0 border-b pb-4 sm:pb-5 [&_h1]:pr-24 lg:[&_h1]:pr-0">
          <PageHeader
            title="Ask Nest"
            description="Research Stellar DeFi, compare opportunities, and plan your next move."
            actions={
              <div className="absolute top-0 right-0 flex items-center gap-1 lg:hidden">
                <Sheet>
                  <SheetTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-11 text-muted-foreground"
                        aria-label="Open conversation history"
                      />
                    }
                  >
                    <PanelLeftOpen />
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[min(90vw,320px)] gap-5">
                    <SheetHeader>
                      <SheetTitle>Conversations</SheetTitle>
                      <SheetDescription>Your current session and workspace.</SheetDescription>
                    </SheetHeader>
                    <div className="flex min-h-0 flex-1 flex-col px-5 pb-6">
                      <SheetClose
                        render={<Button variant="outline" className="mb-6 min-h-11 justify-start gap-2 px-3" />}
                        onClick={newConversation}
                      >
                        <Plus />
                        New conversation
                      </SheetClose>
                      <HistoryContents expanded />
                    </div>
                  </SheetContent>
                </Sheet>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 text-muted-foreground"
                  aria-label="New conversation"
                  onClick={newConversation}
                >
                  <Plus />
                </Button>
              </div>
            }
          />
        </div>
        <ConversationDraft />
      </section>
    </div>
  );
}

function HistoryContents({ expanded }: { expanded: boolean }) {
  return (
    <>
      {expanded ? (
        <div className="mb-5 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-4">
          <div className="mb-2 flex items-center gap-2.5">
            <MessageSquare className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-sm font-medium">Current conversation</p>
          </div>
          <p className="pl-6.5 text-xs text-muted-foreground">Guest session · not saved</p>
        </div>
      ) : null}
      <Separator className="mb-4" />
      <nav aria-label="Conversation resources" className="space-y-1">
        {HISTORY_LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            aria-label={link.label}
            title={link.label}
            className={`flex min-h-11 min-w-11 items-center gap-3 rounded-lg text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground ${expanded ? 'px-3' : 'justify-center'}`}
          >
            <link.icon className="size-4 shrink-0" aria-hidden="true" />
            {expanded ? link.label : <span className="sr-only">{link.label}</span>}
          </Link>
        ))}
      </nav>
      {expanded ? (
        <div className="mt-auto pt-6">
          <div className="rounded-xl border border-dashed px-3.5 py-4">
            <LockKeyhole className="mb-2.5 size-4 text-subtle" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              This conversation stays in your current session. Connect your wallet to save conversations.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
