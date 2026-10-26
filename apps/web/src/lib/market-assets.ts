export const MARKET_ASSETS = [
  { symbol: 'XLM', name: 'Stellar Lumens' },
  { symbol: 'AQUA', name: 'Aquarius' },
  { symbol: 'EURC', name: 'Circle Euro' },
  { symbol: 'USDT0', name: 'USDT0' },
  { symbol: 'PYUSD', name: 'PayPal USD' },
  { symbol: 'SolvBTC', name: 'Solv Protocol Bitcoin' },
  { symbol: 'EUTBL', name: 'Spiko EU T-Bills' },
];

export const MARKET_SYMBOLS = MARKET_ASSETS.map((asset) => asset.symbol);
export const TRADE_ASSETS = [...MARKET_ASSETS, { symbol: 'USDC', name: 'USD Coin' }];
