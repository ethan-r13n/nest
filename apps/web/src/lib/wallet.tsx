import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { allowedWallets, closeEvent } from '@creit.tech/stellar-wallets-kit/state';
import { KitEventType, Networks, SwkAppDarkTheme } from '@creit.tech/stellar-wallets-kit/types';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useHealth } from './health.ts';

interface WalletState {
  address: string | null;
  /** The network passphrase the wallet is set to; a signature only works on that network. */
  networkPassphrase: string | null;
  connecting: boolean;
  error: string | null;
}

interface Wallet extends WalletState {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Asks the selected wallet to sign; Nest never sees a key. */
  sign(xdr: string, networkPassphrase: string): Promise<string>;
}

const WalletContext = createContext<Wallet | null>(null);
let initialized = false;

function kit() {
  if (!initialized) {
    StellarWalletsKit.init({
      modules: defaultModules(),
      authModal: { showInstallLabel: true, hideUnsupportedWallets: false },
      theme: {
        ...SwkAppDarkTheme,
        background: 'var(--nest-surface)',
        'background-secondary': 'var(--nest-surface-raised)',
        'foreground-strong': 'var(--nest-text)',
        foreground: 'var(--nest-text)',
        'foreground-secondary': 'var(--nest-text-secondary)',
        primary: 'var(--nest-accent)',
        'primary-foreground': 'var(--nest-background)',
        lighter: 'var(--nest-text)',
        light: 'var(--nest-text-secondary)',
        'light-gray': 'var(--nest-border-strong)',
        gray: 'var(--nest-text-subtle)',
        danger: 'var(--nest-error)',
        border: 'var(--nest-border)',
        shadow: '0 16px 48px rgba(0, 0, 0, 0.24)',
        'border-radius': 'var(--nest-radius-card)',
        'font-family': 'var(--nest-font-sans)',
      },
    });
    initialized = true;
  }
  return StellarWalletsKit;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const health = useHealth();
  const connecting = useRef(false);
  const [state, setState] = useState<WalletState>({
    address: null,
    networkPassphrase: null,
    connecting: false,
    error: null,
  });

  useEffect(() => {
    return kit().on(KitEventType.STATE_UPDATED, ({ payload }) => {
      setState((current) => ({
        ...current,
        address: payload.address ?? null,
        networkPassphrase: payload.address ? payload.networkPassphrase : null,
      }));
    });
  }, []);

  const connect = useCallback(async () => {
    if (connecting.current) return;
    connecting.current = true;
    setState((current) => ({ ...current, connecting: true, error: null }));
    try {
      if (health.data?.ok) {
        kit().setNetwork(health.data.network === 'testnet' ? Networks.TESTNET : Networks.PUBLIC);
      }
      const { address } = await showWalletDialog('Connect wallet', (container) => kit().authModal({ container }));
      const { networkPassphrase } = await kit().getNetwork();
      setState({ address, networkPassphrase, connecting: false, error: null });
    } catch (error) {
      setState((current) => ({
        ...current,
        connecting: false,
        error: isModalClosed(error) ? null : walletMessage(error),
      }));
    } finally {
      connecting.current = false;
    }
  }, [health.data]);

  const disconnect = useCallback(async () => {
    await kit()
      .disconnect()
      .catch(() => {});
    setState({ address: null, networkPassphrase: null, connecting: false, error: null });
  }, []);

  const sign = useCallback(
    async (xdr: string, networkPassphrase: string) => {
      if (!state.address) throw new Error('Connect your wallet first.');
      // The wallet may have switched networks since connecting; a mismatched signature would be useless.
      const current = await kit().getNetwork();
      if (current.networkPassphrase !== networkPassphrase) {
        setState((previous) => ({ ...previous, networkPassphrase: current.networkPassphrase }));
        throw new Error('Your wallet is set to a different network than this swap. Switch networks in your wallet.');
      }
      try {
        const { signedTxXdr } = await kit().signTransaction(xdr, { networkPassphrase, address: state.address });
        return signedTxXdr;
      } catch (error) {
        throw new Error(walletMessage(error));
      }
    },
    [state.address],
  );

  const value = useMemo(() => ({ ...state, connect, disconnect, sign }), [state, connect, disconnect, sign]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): Wallet {
  const wallet = useContext(WalletContext);
  if (!wallet) throw new Error('Wallet is unavailable');
  return wallet;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function walletMessage(error: unknown): string {
  const message = typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : '';
  if (/reject|declin|denied|cancel/i.test(message)) return 'The request was declined in your wallet.';
  return message || 'Your wallet did not respond. Please try again.';
}

function isModalClosed(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'message' in error && error.message === 'The user closed the modal.'
  );
}

async function showWalletDialog<T>(label: string, open: (container: HTMLElement) => Promise<T>): Promise<T> {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label', label);
  dialog.className =
    'm-auto max-h-[calc(100svh-2rem)] w-[min(22rem,calc(100vw-2rem))] max-w-none overflow-y-auto rounded-xl border bg-card p-0 text-foreground outline-none [color-scheme:dark] backdrop:bg-black/60 [&_.stellar-wallets-kit]:w-full! [&_.stellar-wallets-kit_header_button]:min-h-11! [&_.stellar-wallets-kit_header_button]:min-w-11! [&_.stellar-wallets-kit_header_h1]:font-serif [&_.stellar-wallets-kit_header_h1]:text-xl! [&_.stellar-wallets-kit_li_p]:text-sm! [&_.stellar-wallets-kit_li_p]:font-medium!';
  let closing = false;
  let initialWallets = true;
  const unsubscribeWallets = allowedWallets.subscribe(() => {
    if (initialWallets) {
      initialWallets = false;
      return;
    }
    if (closing) {
      // The kit registers dismissal after discovery. Let that await finish before replaying an early close.
      queueMicrotask(() => queueMicrotask(() => closeEvent.next()));
    }
  });
  const unsubscribe = closeEvent.subscribe(() => {
    closing = true;
    if (dialog.open) dialog.close();
  });
  const observer = new MutationObserver(() => {
    for (const item of dialog.querySelectorAll<HTMLElement>('.stellar-wallets-kit li')) {
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.classList.add(
        'focus-visible:outline-2',
        'focus-visible:outline-[var(--swk-primary)]',
        'focus-visible:outline-offset-2',
      );
    }
    const buttons = dialog.querySelectorAll('header button');
    buttons.item(buttons.length - 1)?.setAttribute('aria-label', 'Close wallet dialog');
    if (buttons.length > 1) buttons.item(0)?.setAttribute('aria-label', 'Wallet help');
  });
  observer.observe(dialog, { childList: true, subtree: true });
  dialog.addEventListener('keydown', (event) => {
    if (
      (event.key === 'Enter' || event.key === ' ') &&
      event.target instanceof HTMLElement &&
      event.target.matches('.stellar-wallets-kit li[role="button"]')
    ) {
      event.preventDefault();
      event.target.click();
    }
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeEvent.next();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeEvent.next();
  });
  document.body.appendChild(dialog);
  try {
    dialog.showModal();
    const result = await open(dialog);
    return result;
  } finally {
    observer.disconnect();
    unsubscribeWallets();
    unsubscribe();
    dialog.close();
    dialog.remove();
  }
}
