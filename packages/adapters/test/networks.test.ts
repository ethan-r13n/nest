import { Networks } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { NETWORK_PASSPHRASES } from '../src/stellar/networks.ts';

describe('NETWORK_PASSPHRASES', () => {
  it('matches the Stellar SDK exactly', () => {
    expect(NETWORK_PASSPHRASES.mainnet).toBe(Networks.PUBLIC);
    expect(NETWORK_PASSPHRASES.testnet).toBe(Networks.TESTNET);
  });
});
