import type { ReactNode } from 'react';

type TextBlock = {
  kind: 'paragraph' | 'heading' | 'quote' | 'code' | 'ordered' | 'unordered';
  offset: number;
  lines: { text: string; offset: number }[];
  start: number;
};

export function MessageContent({ text }: { text: string }) {
  return (
    <div className="space-y-4 text-sm leading-7 [overflow-wrap:anywhere]">
      {parseBlocks(text).map((block) => {
        const content = block.lines.map((line) => line.text).join('\n');
        if (block.kind === 'code') {
          return (
            <pre
              key={block.offset}
              className="overflow-x-auto rounded-xl border bg-card p-4 font-mono text-xs leading-6 whitespace-pre"
            >
              <code>{content}</code>
            </pre>
          );
        }
        if (block.kind === 'ordered' || block.kind === 'unordered') {
          const items = block.lines.map((line) => (
            <li key={line.offset} className="pl-1.5 whitespace-pre-wrap marker:text-muted-foreground">
              {inlineContent(line.text)}
            </li>
          ));
          return block.kind === 'ordered' ? (
            <ol key={block.offset} start={block.start} className="list-decimal space-y-2 pl-5">
              {items}
            </ol>
          ) : (
            <ul key={block.offset} className="list-disc space-y-2 pl-5">
              {items}
            </ul>
          );
        }
        if (block.kind === 'heading') {
          return (
            <h3 key={block.offset} className="pt-1 font-sans text-base font-semibold">
              {inlineContent(content)}
            </h3>
          );
        }
        if (block.kind === 'quote') {
          return (
            <blockquote key={block.offset} className="border-l-2 pl-4 whitespace-pre-wrap text-muted-foreground">
              {inlineContent(content)}
            </blockquote>
          );
        }
        return (
          <p key={block.offset} className="whitespace-pre-wrap">
            {inlineContent(content)}
          </p>
        );
      })}
    </div>
  );
}

function parseBlocks(text: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  let current: TextBlock | undefined;
  let fence: string | undefined;

  for (const match of text.matchAll(/[^\n]+|\n/g)) {
    const line = match[0];
    if (line === '\n') {
      if (text[match.index - 1] === '\n') {
        if (fence) current?.lines.push({ text: '', offset: match.index });
        else current = undefined;
      }
      continue;
    }
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (marker?.startsWith(fence)) {
        fence = undefined;
        current = undefined;
      } else {
        current?.lines.push({ text: line, offset: match.index });
      }
      continue;
    }
    if (!line.trim()) {
      current = undefined;
      continue;
    }
    if (marker) {
      fence = marker;
      current = { kind: 'code', offset: match.index, lines: [], start: 1 };
      blocks.push(current);
      continue;
    }
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);
    const item = /^\s*(?:(\d+)[.)]|[-+*])\s+(.+)$/.exec(line);
    const kind = heading ? 'heading' : quote ? 'quote' : item ? (item[1] ? 'ordered' : 'unordered') : 'paragraph';
    if (!current || current.kind !== kind || kind === 'heading') {
      current = {
        kind,
        offset: match.index,
        lines: [],
        start: item?.[1] ? Number.parseInt(item[1], 10) : 1,
      };
      blocks.push(current);
    }
    current.lines.push({ text: heading?.[1] ?? quote?.[1] ?? item?.[2] ?? line, offset: match.index });
  }
  return blocks;
}

function inlineContent(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let offset = 0;
  for (const match of text.matchAll(/\*\*([^*\n]+)\*\*|__([^_\n]+)__|`([^`\n]+)`|\*([^*\n]+)\*/g)) {
    if (match.index > offset) parts.push(text.slice(offset, match.index));
    if (match[3] !== undefined) {
      parts.push(
        <code key={match.index} className="rounded-md border bg-card px-1.5 py-0.5 font-mono text-[0.85em]">
          {match[3]}
        </code>,
      );
    } else if (match[4] !== undefined) {
      parts.push(<em key={match.index}>{match[4]}</em>);
    } else {
      parts.push(
        <strong key={match.index} className="font-semibold text-foreground">
          {match[1] ?? match[2]}
        </strong>,
      );
    }
    offset = match.index + match[0].length;
  }
  if (offset < text.length) parts.push(text.slice(offset));
  return parts;
}
