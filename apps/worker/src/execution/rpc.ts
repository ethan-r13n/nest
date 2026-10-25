import { rpc, scValToNative, type Transaction } from '@stellar/stellar-sdk';

type SimulationOutcome = { ok: true; minResourceFee: bigint; returnValue: unknown } | { ok: false; error: string };
type SendOutcome = { status: rpc.Api.SendTransactionStatus; error: string | null };
type TransactionOutcome =
  | { status: 'SUCCESS'; ledger: number; returnValue: unknown }
  | { status: 'FAILED'; ledger: number }
  | { status: 'NOT_FOUND' };

/** The Stellar RPC calls a swap needs: simulate the prepared transaction, submit signed bytes, confirm by hash. */
export interface SwapRpc {
  simulate(tx: Transaction): Promise<SimulationOutcome>;
  send(tx: Transaction): Promise<SendOutcome>;
  get(hash: string): Promise<TransactionOutcome>;
}

export function createSwapRpc(url: string): SwapRpc {
  const server = new rpc.Server(url);
  return {
    async simulate(tx) {
      const simulation = await server.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(simulation)) return { ok: false, error: simulation.error.slice(0, 300) };
      const retval = 'result' in simulation ? simulation.result?.retval : undefined;
      return {
        ok: true,
        minResourceFee: BigInt(simulation.minResourceFee),
        returnValue: retval ? scValToNative(retval) : null,
      };
    },
    async send(tx) {
      const response = await server.sendTransaction(tx);
      return {
        status: response.status,
        error: response.status === 'ERROR' && response.errorResult ? response.errorResult.toXdr('base64') : null,
      };
    },
    async get(hash) {
      const response = await server.getTransaction(hash);
      if (response.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        return {
          status: 'SUCCESS',
          ledger: response.ledger,
          returnValue: response.returnValue ? scValToNative(response.returnValue) : null,
        };
      }
      if (response.status === rpc.Api.GetTransactionStatus.FAILED) return { status: 'FAILED', ledger: response.ledger };
      return { status: 'NOT_FOUND' };
    },
  };
}
