import { Badge } from '@nest/ui/components/badge';
import { Button } from '@nest/ui/components/button';
import { Label } from '@nest/ui/components/label';
import { Textarea } from '@nest/ui/components/textarea';
import { AlertTriangle, ArrowDown, ArrowUp, Eraser, LoaderCircle, Square } from 'lucide-react';
import { type KeyboardEvent, useId, useLayoutEffect, useRef, useState } from 'react';

import { ChatRequestError } from '../lib/agent-chat.ts';
import { useWorkspaceSession } from './workspace-session.tsx';

const PROMPTS = [
  'Which Stellar lending protocols hold the most TVL?',
  'Compare USDC yield pools and what drives their APY',
  'Explain a vault’s risks before I deposit',
  'Help me turn a research idea into a monitoring rule',
];
export function ConversationDraft({ compact = false }: { compact?: boolean }) {
  const id = useId();
  const { draft, setDraft, chat } = useWorkspaceSession();
  const { messages, running } = chat;
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  const [sendError, setSendError] = useState<string | null>(null);
  useLayoutEffect(() => {
    const transcript = transcriptRef.current;
    if (messages.length && following && transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [messages, following]);
  function latest() {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
    setFollowing(true);
  }
  function send() {
    const text = draft.trim();
    if (!text || running) return;
    setDraft('');
    setSendError(null);
    setFollowing(true);
    chat.send(text).catch((error: unknown) => {
      setDraft(text);
      setSendError(error instanceof ChatRequestError ? error.message : 'The message was not sent.');
    });
  }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="outline">Not saved</Badge>
        <Badge variant="secondary">{running ? 'Answering…' : 'Dated research · no execution'}</Badge>
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
                {message.text ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.text}</p> : null}
                {message.role === 'assistant' && !message.text && !message.error && !message.stopped ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <LoaderCircle className="size-4 animate-spin" />
                    Working on it…
                  </p>
                ) : null}
                {message.stopped ? <p className="text-xs text-muted-foreground">Stopped.</p> : null}
                {message.error ? (
                  <p className="flex items-center gap-2 text-sm text-destructive">
                    <AlertTriangle className="size-4 shrink-0" />
                    {message.error}
                  </p>
                ) : null}
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
                  Ask about Stellar DeFi. Answers come from a dated research snapshot, and Nest can’t move funds yet.
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
          onKeyDown={onKeyDown}
          maxLength={4000}
          placeholder="Ask Nest anything…"
          className="min-h-24 resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
        />
        {sendError ? <p className="mt-2 text-xs text-destructive">{sendError}</p> : null}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-sm text-xs text-subtle">
            Nothing is signed or executed. Closing this page clears the conversation.
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
            {running ? (
              <Button variant="secondary" onClick={chat.stop}>
                <Square />
                Stop
              </Button>
            ) : (
              <Button onClick={send} disabled={!draft.trim()}>
                <ArrowUp />
                Send
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
