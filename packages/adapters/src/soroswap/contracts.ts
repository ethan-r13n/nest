import type { StellarNetwork } from '@nest/domain/network';

/**
 * The only Soroswap contracts a built swap may call, checked 2026-10-26.
 *
 * - `aggregator` and `router`: public/<network>.contracts.json in github.com/soroswap/aggregator and
 *   github.com/soroswap/core.
 * - `aggregatorV3`: the contract Soroswap's API builds mainnet swaps against. DefiLlama's
 *   soroswap-aggregator adapter lists it as Aggregator v3, live since 2026-09-14, and its wasm
 *   (sha256 437653…3190, as recorded on chain) exposes `swap_exact_in(user, token_in, amount_in,
 *   token_out, min_out, routes, partner)`. Testnet has no v3 deployment, so it is null there.
 */
export const SOROSWAP_CONTRACTS = {
  mainnet: {
    aggregator: 'CAYP3UWLJM7ZPTUKL6R6BFGTRWLZ46LRKOXTERI2K6BIJAWGYY62TXTO',
    router: 'CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH',
    aggregatorV3: 'CARVQXFP4JF5ELLXUMQ6DALR346YVGBMQOHB4ENA7SSVXAYABXLBDDC4',
  },
  testnet: {
    aggregator: 'CC74XDT7UVLUZCELKBIYXFYIX6A6LGPWURJVUXGRPQO745RWX7WEURMA',
    router: 'CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD',
    aggregatorV3: null,
  },
} as const satisfies Record<StellarNetwork, { aggregator: string; router: string; aggregatorV3: string | null }>;
