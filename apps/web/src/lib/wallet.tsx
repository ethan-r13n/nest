import { FREIGHTER_ID, FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

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
  /** Asks the wallet to sign; the user approves or rejects in Freighter. Nest never sees a key. */
  sign(xdr: string, networkPassphrase: string): Promise<string>;
}

const WalletContext = createContext<Wallet | null>(null);
let initialized = false;

// Freighter is the first validated signer; other wallets join after their own signing tests.
function kit() {
  if (!initialized) {
    StellarWalletsKit.init({ modules: [new FreighterModule()], selectedWalletId: FREIGHTER_ID });
    initialized = true;
  }
  return StellarWalletsKit;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({
    address: null,
    networkPassphrase: null,
    connecting: false,
    error: null,
  });

  const connect = useCallback(async () => {
    setState((current) => ({ ...current, connecting: true, error: null }));
    try {
      kit().setWallet(FREIGHTER_ID);
      if (!(await kit().selectedModule.isAvailable())) {
        throw new Error('Freighter is not responding. Unlock it (or install it from freighter.app) and try again.');
      }
      // fetchAddress asks Freighter for access; getAddress only returns an address the kit already has.
      const { address } = await kit().fetchAddress();
      const { networkPassphrase } = await kit().getNetwork();
      setState({ address, networkPassphrase, connecting: false, error: null });
    } catch (error) {
      setState({ address: null, networkPassphrase: null, connecting: false, error: walletMessage(error) });
    }
  }, []);

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
        throw new Error('Freighter is set to a different network than this swap. Switch networks in Freighter.');
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
  if (/reject|declin|denied|cancel/i.test(message)) return 'The request was declined in Freighter.';
  return message || 'Freighter did not respond.';
}
