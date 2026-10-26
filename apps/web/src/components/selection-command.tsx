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

import { parseLendingCommand, type SelectionContext } from '../lib/command.ts';
import { execution } from '../lib/execution.ts';
import { LendingProposalCard } from './lending-proposal.tsx';
import { useWorkspaceSession } from './workspace-session.tsx';

const HIGHLIGHT = 'nest-selection';
const QUOTE_CHARS = 90;
const SelectionCommandContext = createContext<((element: Element) => void) | null>(null);

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
export function SelectionCommand({ children, className }: { children: ReactNode; className?: string }) {
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
        {opened ? <CommandBox key={opened.id} opened={opened} onDone={() => setOpened(null)} /> : null}
      </Popover>
    </SelectionCommandContext.Provider>
  );
}

/** Opens the command box on an element, for keyboard users who cannot drag a selection. */
export function useOpenSelectionCommand() {
  return useContext(SelectionCommandContext);
}

function CommandBox({ opened, onDone }: { opened: Opened; onDone: () => void }) {
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
      const intent = await execution.createLending(parsed);
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
                {command.poolId ? ` in ${context?.poolName}` : ', comparing every Blend pool'}. Review before signing.
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
    const base = JSON.parse(row.dataset.nestContext) as Omit<SelectionContext, 'rate' | 'apyPct'>;
    const rate = element?.closest<HTMLElement>('[data-nest-rate]');
    const kind = rate?.dataset.nestRate;
    return {
      ...base,
      rate: kind === 'supply' || kind === 'borrow' ? kind : null,
      apyPct: rate?.dataset.nestApy ? Number(rate.dataset.nestApy) : null,
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
  return `${typed}\n\nI highlighted "${text.slice(0, 280)}" in ${where}.`;
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
