import { Button } from '@nest/ui/components/button';
import { Input } from '@nest/ui/components/input';
import { Popover, PopoverContent, PopoverTitle } from '@nest/ui/components/popover';
import { cn } from '@nest/ui/lib/utils';
import { ArrowLeft, CornerDownLeft, LoaderCircle, MessageSquare } from 'lucide-react';
import {
  createContext,
  type FormEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { type LendingCommand, parseLendingCommand, parseSelectionBase, type SelectionContext } from '../lib/command.ts';
import { execution } from '../lib/execution.ts';
import { formatUtc } from '../lib/format.ts';
import { LendingProposalCard } from './lending-proposal.tsx';
import { useWorkspaceSession } from './workspace-session.tsx';

const HIGHLIGHT = 'nest-selection';
const QUOTE_CHARS = 90;
const SelectionCommandContext = createContext<((element: Element) => void) | null>(null);
type ResolveLendingCommand = (command: LendingCommand, context: SelectionContext | null) => Promise<LendingCommand>;

interface Opened {
  id: number;
  range: Range;
  text: string;
  context: SelectionContext | null;
}

/**
 * Select any text inside, or a marked rate, and a command box opens beside it. Lending commands
 * ("lend 100 usdc") become a reviewed Blend proposal in place; anything else goes to Ask Nest with the
 * selection quoted. Rows mark what they show with `data-nest-context`, and rates with `data-nest-rate`.
 */
export function SelectionCommand({
  children,
  className,
  resolveLendingCommand,
}: {
  children: ReactNode;
  className?: string;
  resolveLendingCommand?: ResolveLendingCommand;
}) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const count = useRef(0);

  const open = useCallback((range: Range) => {
    const text = range.toString().trim().replace(/\s+/g, ' ');
    if (!text) return;
    count.current += 1;
    setOpened({ id: count.current, range: range.cloneRange(), text, context: readContext(range) });
  }, []);

  const openOn = useCallback(
    (element: Element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      open(range);
    },
    [open],
  );

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (target?.closest('button, a, [role="button"]') && !target.closest('[data-nest-rate]')) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (event.currentTarget.contains(range.commonAncestorContainer)) open(range);
      return;
    }
    const rate = target?.closest('[data-nest-rate]');
    if (rate) openOn(rate);
  }

  useEffect(() => {
    if (!opened || !('highlights' in CSS)) return;
    CSS.highlights.set(HIGHLIGHT, new Highlight(opened.range));
    return () => {
      CSS.highlights.delete(HIGHLIGHT);
    };
  }, [opened]);

  return (
    <SelectionCommandContext.Provider value={openOn}>
      <div className={className} onPointerUp={onPointerUp}>
        {children}
      </div>
      <Popover open={opened !== null} onOpenChange={(next) => (next ? null : setOpened(null))}>
        {opened ? (
          <CommandBox
            key={opened.id}
            opened={opened}
            onDone={() => setOpened(null)}
            resolveLendingCommand={resolveLendingCommand}
          />
        ) : null}
      </Popover>
    </SelectionCommandContext.Provider>
  );
}

/** Opens the command box on an element, for keyboard users who cannot drag a selection. */
export function useOpenSelectionCommand() {
  return useContext(SelectionCommandContext);
}

function CommandBox({
  opened,
  onDone,
  resolveLendingCommand,
}: {
  opened: Opened;
  onDone: () => void;
  resolveLendingCommand?: ResolveLendingCommand | undefined;
}) {
  const { chat, setAssistantOpen } = useWorkspaceSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [intentId, setIntentId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { context } = opened;
  const suggestions = suggestionsFor(context);
  const command = parseLendingCommand(text, context);

  async function run(value: string) {
    const typed = value.trim();
    if (!typed) return;
    setError(null);
    const parsed = parseLendingCommand(typed, context);
    if (!parsed) {
      chat.send(agentPrompt(typed, opened)).catch(() => undefined);
      setAssistantOpen(true);
      onDone();
      return;
    }
    setCreating(true);
    try {
      const resolved = resolveLendingCommand ? await resolveLendingCommand(parsed, context) : parsed;
      const intent = await execution.createLending(resolved);
      setIntentId(intent.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The request could not be created.');
    } finally {
      setCreating(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(text);
  }

  return (
    <PopoverContent
      anchor={{ getBoundingClientRect: () => opened.range.getBoundingClientRect() }}
      side="bottom"
      align="start"
      sideOffset={8}
      initialFocus={inputRef}
      className={cn('max-h-(--available-height) gap-3 overflow-y-auto', intentId ? 'w-[26rem]' : 'w-[22rem]')}
    >
      <PopoverTitle className="sr-only">Act on your selection</PopoverTitle>
      <SelectionQuote opened={opened} />
      {intentId ? (
        <>
          <LendingProposalCard intentId={intentId} />
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => {
              setIntentId(null);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
          >
            <ArrowLeft /> Change command
          </Button>
        </>
      ) : (
        <>
          <form onSubmit={submit} className="flex items-center gap-2">
            <Input
              ref={inputRef}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={suggestions[0] ?? 'Ask about this'}
              aria-label="Tell Nest what to do with your selection"
              autoComplete="off"
              spellCheck={false}
              className="h-10 font-mono"
            />
            <Button type="submit" size="icon" disabled={creating || !text.trim()} aria-label="Run">
              {creating ? <LoaderCircle className="animate-spin" /> : <CornerDownLeft />}
            </Button>
          </form>
          <p className="min-h-4 text-xs text-muted-foreground" aria-live="polite">
            {!text.trim() ? (
              'Type a lending command, or ask anything about this.'
            ) : command ? (
              <>
                {describe(command.kind)} {command.amount} {command.asset}
                {commandDestination(command, context)}. Review before signing.
              </>
            ) : (
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="size-3" /> Goes to Ask Nest with your selection.
              </span>
            )}
          </p>
          {suggestions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setText(suggestion);
                    void run(suggestion);
                  }}
                  className="min-h-8 rounded-md border px-2.5 font-mono text-xs text-muted-foreground hover:border-primary/60 hover:text-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </PopoverContent>
  );
}

function SelectionQuote({ opened }: { opened: Opened }) {
  const { context, text } = opened;
  if (context?.source)
    return (
      <div className="space-y-2">
        <p className="text-sm">
          <span className="font-mono text-base text-primary">{text}</span>{' '}
          <span className="text-muted-foreground">
            {context.source.metric ?? 'reference'} for {context.asset} in {context.poolName}
          </span>
        </p>
        <p className="text-xs text-subtle">Captured Mainnet · {formatUtc(context.source.observedAt)} · not a quote.</p>
        <p className="text-xs text-muted-foreground">
          {context.source.executionNetwork === 'mainnet'
            ? `Execution: Mainnet. Fresh ${context.poolName} terms are checked before review.`
            : context.source.executionNetwork === 'testnet'
              ? 'Execution: Testnet. Fresh Testnet pools are compared; the Mainnet reference is not used as its rate.'
              : 'The current execution network and fresh pool terms are checked before review.'}
        </p>
      </div>
    );
  if (context?.rate && context.apyPct !== null)
    return (
      <p className="text-sm">
        <span className="font-mono text-base tabular-nums text-primary">{context.apyPct.toFixed(2)}%</span>{' '}
        <span className="text-muted-foreground">
          {context.rate === 'supply' ? 'to lend' : 'to borrow'} {context.asset} in {context.poolName}
        </span>
      </p>
    );
  return (
    <blockquote className="border-l-2 border-primary/60 pl-3 text-xs text-muted-foreground">
      {text.length > QUOTE_CHARS ? `${text.slice(0, QUOTE_CHARS)}…` : text}
      {context ? <span className="block text-subtle">{context.poolName}</span> : null}
    </blockquote>
  );
}

function readContext(range: Range): SelectionContext | null {
  const start = range.commonAncestorContainer;
  const element = start instanceof Element ? start : start.parentElement;
  const row = element?.closest<HTMLElement>('[data-nest-context]');
  if (!row?.dataset.nestContext) return null;
  try {
    const decoded: unknown = JSON.parse(row.dataset.nestContext);
    const base = parseSelectionBase(decoded);
    if (!base) return null;
    const rate = element?.closest<HTMLElement>('[data-nest-rate]');
    const kind = rate?.dataset.nestRate;
    const apy = rate?.dataset.nestApy ? Number(rate.dataset.nestApy) : null;
    if (base.source && rate?.dataset.nestMetric) base.source.metric = rate.dataset.nestMetric.slice(0, 40);
    return {
      ...base,
      rate: kind === 'supply' || kind === 'borrow' ? kind : null,
      apyPct: apy !== null && Number.isFinite(apy) ? apy : null,
    };
  } catch {
    return null;
  }
}

function suggestionsFor(context: SelectionContext | null): string[] {
  if (!context) return [];
  const asset = context.asset.toLowerCase();
  const lend = `lend 100 ${asset}`;
  const borrow = `borrow 100 ${asset}`;
  return context.rate === 'borrow' ? [borrow, lend] : [lend, borrow];
}

function agentPrompt(typed: string, opened: Opened): string {
  const { context, text } = opened;
  const where = context
    ? `the ${context.asset} row of ${context.poolName} on Blend${context.rate && context.apyPct !== null ? ` (${context.rate} APY ${context.apyPct.toFixed(2)}%)` : ''}`
    : 'the Research page';
  const source = context?.source
    ? ` This is a captured Mainnet ${context.source.metric ?? 'reference'} from ${context.source.observedAt}, not a quote. Execution network: ${context.source.executionNetwork ?? 'check before quoting'}.`
    : '';
  return `${typed}\n\nI highlighted "${text.slice(0, 280)}" in ${where}.${source}`;
}

function commandDestination(command: LendingCommand, context: SelectionContext | null): string {
  if (context?.source) {
    return context.source.executionNetwork === 'mainnet' && command.asset === context.asset
      ? ` in ${context.poolName}, after checking fresh Mainnet terms`
      : `, comparing fresh ${context.source.executionNetwork ?? 'current-network'} Blend pools`;
  }
  return command.poolId ? ` in ${context?.poolName}` : ', comparing every Blend pool';
}

function describe(kind: string): string {
  const labels: Record<string, string> = {
    supply: 'Lend',
    borrow: 'Borrow',
    repay: 'Repay',
    withdraw: 'Withdraw',
  };
  return labels[kind] ?? kind;
}
