import { env } from 'cloudflare:workers';
import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Networks,
  Operation,
  rpc,
  TransactionBuilder,
  WebAuth,
} from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

const HOME_DOMAIN = 'nest.local';

// These run in workerd with the production compatibility date and no Node.js compatibility flag.

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function payment(source: Keypair, amount: string, destination: string) {
  const account = new Account(source.publicKey(), '41');
  return new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.payment({ destination, asset: Asset.native(), amount }))
    .setTimeout(300)
    .build();
}

describe('Stellar SDK in workerd', () => {
  it('builds, signs, serializes and hashes a transaction offline', () => {
    const source = Keypair.random();
    const destination = Keypair.random().publicKey();
    const transaction = payment(source, '1.5', destination);
    transaction.sign(source);

    const restored = TransactionBuilder.fromXDR(transaction.toXDR(), Networks.TESTNET);
    expect(hex(restored.hash())).toBe(hex(transaction.hash()));
    expect(hex(transaction.hash())).toMatch(/^[0-9a-f]{64}$/);
    expect(WebAuth.verifyTxSignedBy(restored, source.publicKey())).toBe(true);
    expect(WebAuth.verifyTxSignedBy(restored, destination)).toBe(false);
  });

  it('gives a different hash to any changed economic field, so approvals can bind to it', () => {
    const source = Keypair.random();
    const destination = Keypair.random().publicKey();
    const approved = payment(source, '1.5', destination);
    const same = TransactionBuilder.fromXDR(approved.toXDR(), Networks.TESTNET);
    expect(hex(same.hash())).toBe(hex(approved.hash()));
    expect(hex(payment(source, '2', destination).hash())).not.toBe(hex(approved.hash()));
    expect(hex(payment(source, '1.5', Keypair.random().publicKey()).hash())).not.toBe(hex(approved.hash()));
  });

  it('completes a SEP-10 challenge round trip', () => {
    const server = Keypair.random();
    const client = Keypair.random();
    const challenge = WebAuth.buildChallengeTx(
      server,
      client.publicKey(),
      HOME_DOMAIN,
      300,
      Networks.TESTNET,
      HOME_DOMAIN,
    );
    const { tx, clientAccountID } = WebAuth.readChallengeTx(
      challenge,
      server.publicKey(),
      Networks.TESTNET,
      HOME_DOMAIN,
      HOME_DOMAIN,
    );
    expect(clientAccountID).toBe(client.publicKey());
    tx.sign(client);
    const signers = WebAuth.verifyChallengeTxSigners(
      tx.toXDR(),
      server.publicKey(),
      Networks.TESTNET,
      [client.publicKey()],
      HOME_DOMAIN,
      HOME_DOMAIN,
    );
    expect(signers).toEqual([client.publicKey()]);
  });

  it('rejects a SEP-10 challenge signed by someone else', () => {
    const server = Keypair.random();
    const client = Keypair.random();
    const challenge = WebAuth.buildChallengeTx(
      server,
      client.publicKey(),
      HOME_DOMAIN,
      300,
      Networks.TESTNET,
      HOME_DOMAIN,
    );
    const { tx } = WebAuth.readChallengeTx(challenge, server.publicKey(), Networks.TESTNET, HOME_DOMAIN, HOME_DOMAIN);
    tx.sign(Keypair.random());
    expect(() =>
      WebAuth.verifyChallengeTxSigners(
        tx.toXDR(),
        server.publicKey(),
        Networks.TESTNET,
        [client.publicKey()],
        HOME_DOMAIN,
        HOME_DOMAIN,
      ),
    ).toThrow();
  });

  it.skipIf(env.NEST_LIVE_TESTNET !== '1')('reads the latest Testnet ledger over RPC', async () => {
    const server = new rpc.Server('https://soroban-testnet.stellar.org');
    const [health, latest] = await Promise.all([server.getHealth(), server.getLatestLedger()]);
    expect(health.status).toBe('healthy');
    expect(latest.sequence).toBeGreaterThan(0);
    console.log(JSON.stringify({ rpc: 'testnet', latestLedger: latest.sequence, protocol: latest.protocolVersion }));
  });
});
