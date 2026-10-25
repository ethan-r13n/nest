import { Badge } from '@nest/ui/components/badge';
import { Button } from '@nest/ui/components/button';
import { Label } from '@nest/ui/components/label';
import { Textarea } from '@nest/ui/components/textarea';
import { ArrowDown, ArrowUp, Eraser } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState } from 'react';

import { useWorkspaceSession } from './workspace-session.tsx';

const PROMPTS = [
  'Compare USDC yield opportunities and withdrawal conditions',
  'What can I use on Stellar for borrowing?',
  'Explain a vault’s risks before I deposit',
  'Help me turn a research idea into a monitoring rule',
];
const NO_MESSAGES: ConversationMessage[] = [];

type ConversationMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  preparation?: { id: string; label: string; state: 'running' | 'complete' | 'failed' }[];
};

export function ConversationDraft({
  compact = false,
  messages = NO_MESSAGES,
}: {
  compact?: boolean;
  messages?: ConversationMessage[];
}) {
  const id = useId();
  const { draft, setDraft } = useWorkspaceSession();
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  useLayoutEffect(() => {
    const transcript = transcriptRef.current;
    if (messages.length && following && transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [messages, following]);
  function latest() {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
    setFollowing(true);
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="outline">Unsaved draft</Badge>
        <Badge variant="secondary">Agent not connected</Badge>
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard readers need to scroll the transcript independently of the composer.
          tabIndex={0}
          ref={transcriptRef}
          role="log"
          aria-label="Nest conversation"
          aria-live="polite"
          aria-relevant="additions"
          onScroll={(event) => {
            const element = event.currentTarget;
            setFollowing(element.scrollHeight - element.scrollTop - element.clientHeight < 48);
          }}
          className={`min-h-0 overflow-y-auto overscroll-contain rounded-lg focus-visible:outline-ring h-full`}
        >
          {messages.length ? (
            messages.map((message) => (
              <article key={message.id} className="mb-5 space-y-2 rounded-lg border bg-card p-4">
                <p className="font-mono text-xs uppercase text-subtle">{message.role === 'user' ? 'You' : 'Nest'}</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.text}</p>
                {message.preparation?.length ? (
                  <details>
                    <summary className="min-h-11 cursor-pointer py-3 text-xs text-muted-foreground">
                      Preparation activity
                    </summary>
                    <ol className="space-y-2">
                      {message.preparation.map((step) => (
                        <li key={step.id} className="flex gap-2 text-xs">
                          <Badge variant="outline">{step.state}</Badge>
                          {step.label}
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
              </article>
            ))
          ) : (
            <div className="flex min-h-full flex-col justify-center gap-5 px-1 py-4">
              <div className={compact ? 'space-y-2' : 'mx-auto max-w-2xl space-y-3 text-center'}>
                <p className="font-mono text-xs uppercase tracking-wider text-subtle">Research, compare, then act</p>
                <h2 className={compact ? 'text-2xl font-semibold' : 'text-3xl font-semibold sm:text-4xl'}>
                  What would you like to do?
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Draft a question or explore the research workspace. Answers and reviewed action proposals require a
                  connected agent.
                </p>
              </div>
              <div className={compact ? 'grid gap-2' : 'mx-auto grid w-full max-w-2xl gap-3 sm:grid-cols-2'}>
                {PROMPTS.map((prompt) => (
                  <Button
                    key={prompt}
                    variant="outline"
                    className="h-auto min-h-16 justify-start whitespace-normal p-4 text-left text-sm"
                    onClick={() => setDraft(prompt)}
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
        {messages.length && !following ? (
          <Button variant="secondary" className="absolute right-2 bottom-2 min-h-11 shadow-sm" onClick={latest}>
            <ArrowDown />
            Latest
          </Button>
        ) : null}
      </div>
      <div className="shrink-0 rounded-xl border bg-card p-4">
        <Label htmlFor={id} className="sr-only">
          Message Nest
        </Label>
        <Textarea
          id={id}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          placeholder="Ask Nest anything…"
          className="min-h-24 resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-sm text-xs text-subtle">
            Nothing is sent, saved or executed. Closing this page clears the draft.
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Clear draft"
              disabled={!draft}
              onClick={() => setDraft('')}
            >
              <Eraser />
            </Button>
            <Button disabled>
              <ArrowUp />
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
