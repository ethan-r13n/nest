import { Badge } from '@nest/ui/components/badge';
import { Button } from '@nest/ui/components/button';
import { Label } from '@nest/ui/components/label';
import { Textarea } from '@nest/ui/components/textarea';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Bell,
  BookOpen,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  Coins,
  Eraser,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Square,
} from 'lucide-react';
import { type KeyboardEvent, useId, useLayoutEffect, useRef, useState } from 'react';

import symbolUrl from '../../../../design/nest/assets/nest-symbol-cream.svg';
import { ChatRequestError } from '../lib/agent-chat.ts';
import { MessageContent } from './message-content.tsx';
import { SwapProposalCard } from './swap-proposal.tsx';
import { useWorkspaceSession } from './workspace-session.tsx';

const PROMPTS = [
  { label: 'Explore lending', text: 'Which Stellar lending protocols hold the most TVL?', icon: ChartNoAxesCombined },
  { label: 'Compare yields', text: 'Compare USDC yield pools and what drives their APY', icon: Coins },
  { label: 'Understand risk', text: 'Explain a vault’s risks before I deposit', icon: ShieldCheck },
  { label: 'Follow an idea', text: 'Help me turn a research idea into a monitoring rule', icon: Bell },
];

export function ConversationDraft({ compact = false }: { compact?: boolean }) {
  const id = useId();
  const { draft, setDraft, chat } = useWorkspaceSession();
  const { messages, running } = chat;
  const transcriptRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
    textareaRef.current?.focus();
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
    <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <LockKeyhole className="size-3.5" aria-hidden="true" />
          Guest session
        </span>
        <span role="status" className="inline-flex items-center gap-1.5">
          {running ? (
            <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <BookOpen className="size-3.5" aria-hidden="true" />
          )}
          {running ? 'Answering…' : 'Dated research · no execution'}
        </span>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard readers need to scroll the transcript independently of the composer.
          tabIndex={0}
          ref={transcriptRef}
          role="log"
          aria-label="Nest conversation"
          aria-live="polite"
          aria-relevant="additions text"
          onScroll={(event) => {
            const element = event.currentTarget;
            setFollowing(element.scrollHeight - element.scrollTop - element.clientHeight < 48);
          }}
          className="h-full min-h-0 overflow-y-auto overscroll-contain rounded-xl px-1 [scrollbar-gutter:stable] focus-visible:outline-ring"
        >
          {messages.length ? (
            <div className="space-y-7 pt-2 pb-6 sm:space-y-9">
              {messages.map((message) => (
                <article
                  key={message.id}
                  aria-label={message.role === 'user' ? 'Your message' : 'Nest response'}
                  className={
                    message.role === 'user'
                      ? 'ml-auto w-fit max-w-[92%] rounded-2xl rounded-tr-md border bg-secondary/70 px-4 py-3.5 sm:max-w-[85%] sm:px-5'
                      : `flex min-w-0 ${compact ? 'gap-2.5' : 'gap-3 sm:gap-4'}`
                  }
                >
                  {message.role === 'assistant' ? (
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-xl border bg-card sm:size-9">
                      <img src={symbolUrl} alt="" className="size-4 sm:size-5" />
                    </div>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p
                      className={`mb-2 text-xs font-medium ${message.role === 'user' ? 'text-muted-foreground' : 'pt-1.5 text-foreground'}`}
                    >
                      {message.role === 'user' ? 'You' : 'Nest'}
                    </p>
                    {message.text ? (
                      message.role === 'assistant' ? (
                        <MessageContent text={message.text} />
                      ) : (
                        <p className="text-sm leading-7 whitespace-pre-wrap [overflow-wrap:anywhere]">{message.text}</p>
                      )
                    ) : null}
                    {message.role === 'assistant' && !message.text && !message.error && !message.stopped ? (
                      <p className="flex items-center gap-2 text-sm leading-7 text-muted-foreground">
                        <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                        Looking into it…
                      </p>
                    ) : null}
                    {message.stopped ? <p className="mt-3 text-xs text-muted-foreground">Response stopped.</p> : null}
                    {message.error ? (
                      <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-destructive">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        {message.error}
                      </p>
                    ) : null}
                    {message.proposals?.length ? (
                      <div className="mt-4 space-y-3">
                        {message.proposals.map((intentId) => (
                          <SwapProposalCard key={intentId} intentId={intentId} />
                        ))}
                      </div>
                    ) : null}
                    {message.preparation?.length ? (
                      <details className="group mt-5 border-t border-border/70 pt-1">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                          <ChevronDown
                            className="size-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                            aria-hidden="true"
                          />
                          Preparation activity
                          <span className="ml-auto font-mono text-[10px] text-subtle">
                            {message.preparation.length} {message.preparation.length === 1 ? 'step' : 'steps'}
                          </span>
                        </summary>
                        <ol className="space-y-2 pb-3 pl-5">
                          {message.preparation.map((step) => (
                            <li key={step.id} className="flex items-start gap-2.5 text-xs leading-5">
                              <Badge variant="outline" className="mt-0.5 gap-1 text-[10px] font-normal">
                                {step.state === 'complete' ? <Check aria-hidden="true" /> : null}
                                {step.state}
                              </Badge>
                              <span className="min-w-0 text-muted-foreground">{step.label}</span>
                            </li>
                          ))}
                        </ol>
                      </details>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="flex min-h-full flex-col justify-center gap-7 py-6 sm:py-10">
              <div className={compact ? 'space-y-3' : 'mx-auto max-w-lg space-y-3 text-center'}>
                <div
                  className={`mb-5 flex size-12 items-center justify-center rounded-2xl border bg-card ${compact ? '' : 'mx-auto'}`}
                >
                  <img src={symbolUrl} alt="" className="size-6" />
                </div>
                <h2 className={compact ? 'text-2xl font-semibold' : 'text-2xl font-semibold sm:text-3xl'}>
                  What would you like to explore?
                </h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  Find your way through Stellar DeFi. Start with a question, or explore an idea below.
                </p>
              </div>
              <div className={compact ? 'grid gap-2' : 'mx-auto grid w-full max-w-2xl gap-3 sm:grid-cols-2'}>
                {PROMPTS.map((prompt) => (
                  <Button
                    key={prompt.label}
                    variant="outline"
                    className="group h-auto min-h-28 items-start justify-start gap-3 whitespace-normal border-border bg-card/50 p-4 text-left transition-colors hover:border-primary/35 hover:bg-secondary dark:border-border dark:bg-card/50 dark:hover:bg-secondary"
                    onClick={() => {
                      setDraft(prompt.text);
                      textareaRef.current?.focus();
                    }}
                  >
                    <prompt.icon className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden="true" />
                    <span className="min-w-0 flex-1 space-y-1.5">
                      <span className="block text-xs font-medium text-foreground">{prompt.label}</span>
                      <span className="block text-xs leading-5 font-normal text-muted-foreground">{prompt.text}</span>
                    </span>
                    <ArrowUpRight
                      className="mt-0.5 size-3.5 text-subtle transition-colors group-hover:text-primary"
                      aria-hidden="true"
                    />
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
        {messages.length && !following ? (
          <Button
            variant="secondary"
            className="absolute right-4 bottom-3 min-h-11 gap-2 rounded-full border px-4 shadow-lg"
            onClick={latest}
          >
            <ArrowDown />
            Latest
          </Button>
        ) : null}
      </div>

      <div className="shrink-0 space-y-2.5">
        <form
          className="overflow-hidden rounded-2xl border border-foreground/20 bg-card shadow-[0_8px_30px_rgba(0,0,0,0.12)] transition-[border-color,box-shadow] focus-within:border-primary/50 focus-within:ring-3 focus-within:ring-primary/10"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <Label htmlFor={id} className="sr-only">
            Message Nest
          </Label>
          <Textarea
            ref={textareaRef}
            id={id}
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={onKeyDown}
            maxLength={4000}
            placeholder="Ask a question or explore an idea…"
            aria-describedby={`${id}-hint${sendError ? ` ${id}-error` : ''}`}
            className="block max-h-48 min-h-24 resize-none rounded-none border-0 bg-transparent px-4 pt-4 pb-3 text-base leading-7 shadow-none placeholder:text-subtle focus-visible:ring-0 sm:min-h-28 sm:px-5 sm:pt-5 md:text-[15px] dark:bg-transparent"
          />
          {sendError ? (
            <p id={`${id}-error`} role="alert" className="px-4 pb-3 text-xs leading-relaxed text-destructive sm:px-5">
              {sendError}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2.5 sm:px-4">
            <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground sm:gap-2 sm:text-xs">
              <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
              Research only
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              {draft.length >= 3500 ? (
                <span className="font-mono text-[10px] text-muted-foreground" aria-live="polite">
                  {draft.length}/4000
                </span>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 text-muted-foreground"
                aria-label="Clear draft"
                title="Clear draft"
                disabled={!draft}
                onClick={() => setDraft('')}
              >
                <Eraser />
              </Button>
              {running ? (
                <Button type="button" variant="secondary" className="min-h-11 gap-2 px-4" onClick={chat.stop}>
                  <Square />
                  Stop
                </Button>
              ) : (
                <Button type="submit" className="min-h-11 gap-2 px-4" disabled={!draft.trim()}>
                  Send
                  <ArrowUp />
                </Button>
              )}
            </div>
          </div>
        </form>
        <div
          id={`${id}-hint`}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-[11px] leading-5 text-subtle"
        >
          <p>Not saved. Nothing is signed or executed.</p>
          {!compact ? <p className="hidden sm:block">Enter to send · Shift + Enter for a new line</p> : null}
        </div>
      </div>
    </div>
  );
}
