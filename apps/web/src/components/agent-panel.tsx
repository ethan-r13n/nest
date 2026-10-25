import { Button } from '@nest/ui/components/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@nest/ui/components/sheet';
import { Link } from '@tanstack/react-router';
import { Bot, X } from 'lucide-react';

import { ConversationDraft } from './conversation-draft.tsx';
import { useWorkspaceSession } from './workspace-session.tsx';

export function AgentPanel({ desktop }: { desktop: boolean }) {
  const { assistantOpen, setAssistantOpen } = useWorkspaceSession();
  if (desktop)
    return (
      <Button
        id="ask-nest-trigger"
        variant="ghost"
        size="icon"
        aria-label={assistantOpen ? 'Close Ask Nest' : 'Open Ask Nest'}
        aria-expanded={assistantOpen}
        aria-controls="context-assistant"
        onClick={() => setAssistantOpen(!assistantOpen)}
      >
        <Bot />
      </Button>
    );
  return (
    <Sheet open={assistantOpen} onOpenChange={setAssistantOpen}>
      <SheetTrigger render={<Button id="ask-nest-trigger" variant="ghost" size="icon" aria-label="Open Ask Nest" />}>
        <Bot />
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-[440px]">
        <SheetHeader>
          <SheetTitle>Ask Nest</SheetTitle>
          <SheetDescription>Keep a question beside your workspace.</SheetDescription>
        </SheetHeader>
        <AssistantContents />
      </SheetContent>
    </Sheet>
  );
}

export function AdjacentAssistant() {
  const { setAssistantOpen } = useWorkspaceSession();
  return (
    <aside
      id="context-assistant"
      aria-label="Context assistant"
      className="flex h-full min-h-0 min-w-0 flex-col bg-card"
    >
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="text-xl font-semibold">Ask Nest</h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close assistant"
          onClick={() => {
            setAssistantOpen(false);
            document.getElementById('ask-nest-trigger')?.focus();
          }}
        >
          <X />
        </Button>
      </div>
      <AssistantContents />
    </aside>
  );
}

function AssistantContents() {
  const { setAssistantOpen } = useWorkspaceSession();
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
      <ConversationDraft compact />
      <Link
        to="/chat"
        onClick={() => setAssistantOpen(false)}
        className="mt-4 min-h-11 rounded-lg py-3 text-center text-sm text-primary hover:underline"
      >
        Continue in chat
      </Link>
      <p className="text-center text-xs text-subtle">Your unsaved draft carries over in this session.</p>
    </div>
  );
}
