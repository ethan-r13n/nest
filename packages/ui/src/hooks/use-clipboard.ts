import { useState } from 'react';

type ClipboardStatus = 'idle' | 'copied' | 'unavailable';

export function useClipboard() {
  const [status, setStatus] = useState<ClipboardStatus>('idle');

  async function copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('copied');
    } catch {
      setStatus('unavailable');
    }
  }

  return { copy, status };
}
