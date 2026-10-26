import { Badge } from '@nest/ui/components/badge';
import { Button } from '@nest/ui/components/button';
import { Input } from '@nest/ui/components/input';
import { Label } from '@nest/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@nest/ui/components/select';
import { Textarea } from '@nest/ui/components/textarea';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
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

import accentSymbolUrl from '../../../../design/nest/assets/nest-symbol.svg';
import symbolUrl from '../../../../design/nest/assets/nest-symbol-cream.svg';
import { ChatRequestError } from '../lib/agent-chat.ts';
import { amountDraftIssue } from '../lib/draft-validation.ts';
import { AssetSelect } from './financial-draft.tsx';
import { MessageContent } from './message-content.tsx';
import { ProposalCard } from './proposal-card.tsx';
import { useWorkspaceSession } from './workspace-session.tsx';

const HORIZON_DAYS = ['7', '30', '90'];

const PROMPTS = [
  { label: 'Swap 1,000 XLM for USDC', text: 'Compare a swap of 1000 XLM for USDC.', icon: Coins, description: '' },
  {
    label: 'Supply 1,000 USDC on Blend',
    text: 'Compare supplying 1000 USDC on Blend.',
    icon: ChartNoAxesCombined,
    description: '',
  },
];

const STRATEGY_PROMPTS = [
  {
    label: 'Watch a pool divergence',
    description: 'Compare XLM prices across two Stellar pools',
    text: 'Help me define a rule comparing XLM/USDC prices across two Stellar pools. Explain fees, sizing and trigger evidence.',
    icon: ChartNoAxesCombined,
  },
  {
    label: 'Follow BTC momentum',
    description: 'Explore an EMA signal and its data requirements',
    text: 'Help me research a thesis about BTC closing above its 20-day EMA and an XLM entry. Identify data requirements and unsupported execution before proposing anything.',
    icon: ChartNoAxesCombined,
  },
  {
    label: 'Catch a volume breakout',
    description: 'Research a breakout against a dated volume baseline',
    text: 'Help me research an XLM volume-breakout thesis. Define the baseline, entry, exit and invalidation, and explain which data is available.',
    icon: Coins,
  },
  {
    label: 'Watch a better supply rate',
    description: 'Compare the current venue against a target rate',
    text: 'Help me define a supply-rate alert for USDC across supported venues. Keep incentives and withdrawal timing separate, and disclose unsupported monitoring.',
    icon: ArrowUpRight,
  },
];

export function ConversationDraft({
  compact = false,
  purpose = 'research',
}: {
  compact?: boolean;
  purpose?: 'research' | 'strategy';
}) {
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
    <div
      className={`conversation-draft ${purpose === 'strategy' ? 'conversation-strategy' : 'conversation-research'} mx-auto flex min-h-0 w-full flex-1 flex-col gap-4`}
    >
      <div className="conversation-status flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-1 text-xs text-muted-foreground">
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
          {running ? 'Answering…' : 'Research sources · reviewed proposals'}
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
                        {message.proposals.map((proposal) => (
                          <ProposalCard key={proposal.intentId} {...proposal} />
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
            <div className="conversation-welcome flex min-h-full flex-col gap-5 py-6">
              <div className={compact ? 'space-y-3' : 'mx-auto max-w-lg space-y-3 text-center'}>
                <div className="conversation-welcome-title mb-3 flex items-center justify-center gap-3">
                  <img src={accentSymbolUrl} alt="" className="w-9" />
                  <h2 className="font-serif text-3xl font-semibold">
                    {purpose === 'strategy' ? 'What’s Your Thesis?' : 'What Would You Like To Do?'}
                  </h2>
                </div>
                <p className="text-[13px] leading-6 text-muted-foreground">
                  {purpose === 'strategy'
                    ? 'Tell Nest what you want to test, over what period, and what would make the strategy worth pursuing.'
                    : 'Ask about a market, compare venues, or bring a specific action to review.'}
                </p>
              </div>
              <div className={compact ? 'grid gap-2' : 'conversation-prompts mx-auto grid w-full gap-3 sm:grid-cols-2'}>
                {(purpose === 'strategy' ? STRATEGY_PROMPTS : PROMPTS).map((prompt) => (
                  <Button
                    key={prompt.label}
                    variant="outline"
                    className="group h-auto min-h-14 items-center justify-start gap-3 whitespace-normal border-border bg-background p-4 text-left transition-colors hover:border-primary/35 hover:bg-secondary"
                    onClick={() => {
                      setDraft(prompt.text);
                      textareaRef.current?.focus();
                    }}
                  >
                    <prompt.icon className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden="true" />
                    <span className="min-w-0 flex-1 space-y-1.5">
                      <span className="block text-xs font-medium text-foreground">{prompt.label}</span>
                      {prompt.description ? (
                        <span className="block text-[11px] leading-5 text-muted-foreground">{prompt.description}</span>
                      ) : null}
                    </span>
                    <ArrowUpRight
                      className="mt-0.5 size-3.5 text-subtle transition-colors group-hover:text-primary"
                      aria-hidden="true"
                    />
                  </Button>
                ))}
              </div>
              {!compact && purpose === 'research' ? (
                <AllocationDraft
                  onDraft={(text) => {
                    setDraft(text);
                    textareaRef.current?.focus();
                  }}
                />
              ) : null}
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
          className="conversation-composer overflow-hidden rounded-xl border border-foreground/20 bg-card transition-colors focus-within:border-primary/50"
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
            placeholder={
              purpose === 'strategy'
                ? 'Here’s my thesis: compare two XLM pools and alert me when the gap opens…'
                : 'Ask Nest anything…'
            }
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
              Review exact effects before signing
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

function AllocationDraft({ onDraft }: { onDraft: (text: string) => void }) {
  const id = useId();
  const [capital, setCapital] = useState('');
  const [asset, setAsset] = useState('USDC');
  const [horizon, setHorizon] = useState('30');
  const issue = amountDraftIssue(capital, false);
  return (
    <form
      className="workspace-panel allocation-draft mx-auto w-full p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (amountDraftIssue(capital, true)) return;
        onDraft(
          'Compare allocating ' +
            capital.trim() +
            ' ' +
            asset +
            ' for ' +
            horizon +
            ' days across Stellar opportunities. Include fees, risks and exit conditions.',
        );
      }}
    >
      <p className="mb-5 text-sm">I want to allocate</p>
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_0.8fr_0.9fr_auto]">
        <div className="space-y-2">
          <Label htmlFor={id} className="font-mono text-[10px] uppercase">
            Capital
          </Label>
          <Input
            id={id}
            value={capital}
            onChange={(event) => setCapital(event.currentTarget.value)}
            inputMode="decimal"
            placeholder="Enter amount"
            className="min-h-11 bg-background"
            aria-invalid={Boolean(issue)}
            aria-describedby={issue ? `${id}-error` : undefined}
          />
        </div>
        <AssetSelect label="Asset" value={asset} onChange={setAsset} />
        <div className="space-y-2">
          <Label htmlFor={`${id}-horizon`} className="font-mono text-[10px] uppercase">
            Horizon
          </Label>
          <Select value={horizon} onValueChange={(next) => next !== null && setHorizon(next)}>
            <SelectTrigger id={`${id}-horizon`} className="min-h-11 w-full bg-background text-xs">
              <SelectValue>{horizon} days</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {HORIZON_DAYS.map((days) => (
                <SelectItem className="min-h-11" key={days} value={days}>
                  {days} days
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button className="workspace-action" type="submit" disabled={!capital.trim() || Boolean(issue)}>
          Compare with Nest <ArrowUpRight />
        </Button>
      </div>
      {issue ? (
        <p id={`${id}-error`} role="alert" className="mt-2 text-xs text-destructive">
          {issue}
        </p>
      ) : null}
      <p className="mt-3 text-[10px] text-subtle">Creates a draft for your review. Nothing is sent automatically.</p>
    </form>
  );
}
