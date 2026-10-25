import importlib.util
from pathlib import Path
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('market_data', Path(__file__).with_name('market_data.py'))
market = importlib.util.module_from_spec(spec)
spec.loader.exec_module(market)


class MarketDataTest(unittest.TestCase):
    def setUp(self):
        market.CACHE.clear()

    def test_usdc_conversion_and_missing_quotes(self):
        base = [{'timestamp': 1000, 'price': 2}, {'timestamp': 2000, 'price': 3}]
        quotes = [{'timestamp': 1005, 'price': .5}]
        self.assertEqual(market.normalize_prices(base, quotes, 30), [{'time': 1000, 'value': 4}])
        with self.assertRaises(ValueError):
            market.normalize_prices(base, [{'timestamp': 1005, 'price': 0}], 30)

    def test_observed_ohlc_order_dedup_gaps_and_daily_nav(self):
        start = market.timestamp('2026-01-01T00:00:00Z')
        points = [{'time': start + 60, 'value': 3}, {'time': start + 120, 'value': 2}, {'time': start + 180, 'value': 5}, {'time': start + 240, 'value': 4}, {'time': start + 4 * 3600, 'value': 9}]
        rows = market.observation_candles([points[2], points[0], points[3], points[1], points[0], points[4]], '1H')
        self.assertEqual(rows, [
            {'time': start, 'open': 3, 'high': 5, 'low': 2, 'close': 4, 'samples': 4},
            {'time': start + 4 * 3600, 'open': 9, 'high': 9, 'low': 9, 'close': 9, 'samples': 1},
        ])
        self.assertFalse(any('volume' in row for row in rows))
        nav = market.observation_candles([{'time': start, 'value': 1.2}], '1D')[0]
        self.assertEqual([nav[k] for k in ['open', 'high', 'low', 'close']], [1.2] * 4)
        self.assertEqual(market.observation_candles([{'time': int(time.time()) + 3600, 'value': 1}], '1H'), [])

    def test_swap_direction_dedup_and_ohlcv(self):
        base, quote = market.REGISTRY['AQUA']['contract'], market.REGISTRY['USDC']['contract']
        first = {'event_type': 'swap', 'tokens': [base, quote], 'amounts': ['100000000', '-20000000'], 'ledger_close_at_str': '2026-01-01 00:01:00', 'transaction_hash': 'a', 'ledger': 1}
        second = {**first, 'tokens': [quote, base], 'amounts': ['30000000', '-100000000'], 'ledger_close_at_str': '2026-01-01 00:02:00', 'transaction_hash': 'b'}
        wrong_identity = {**first, 'tokens': ['other-token-with-the-same-symbol', quote]}
        rows = market.aqua_candles([second, first, first, wrong_identity], '1H')
        self.assertEqual(len(rows), 1)
        self.assertEqual({key: rows[0][key] for key in ['open', 'high', 'low', 'close', 'volume']}, {'open': .2, 'high': .3, 'low': .2, 'close': .3, 'volume': 20})
        gap = {**first, 'transaction_hash': 'c', 'ledger_close_at_str': '2026-01-01 04:01:00'}
        self.assertEqual(len(market.aqua_candles([first, gap], '1H')), 2)

    def test_spot_fallback_uses_usdc_ratio_and_contract_identity(self):
        tokens = {'items': [{'address': market.REGISTRY['AQUA']['contract'], 'price_xlm': '.02'}, {'address': market.REGISTRY['USDC']['contract'], 'price_xlm': '5'}]}
        with patch.object(market, 'request', side_effect=[OSError('primary unavailable'), tokens]):
            price = market.spot_price('AQUA')
        self.assertEqual(price['source'], 'Aquarius')
        self.assertEqual(price['value'], .004)

    def test_aquarius_eight_decimal_price_and_metadata_mismatch(self):
        tokens = {'items': [{'address': market.REGISTRY['SOLVBTC']['contract'], 'decimals': 8, 'price_xlm': '100'}, {'address': market.REGISTRY['USDC']['contract'], 'decimals': 7, 'price_xlm': '5'}]}
        with patch.object(market, 'request', side_effect=[OSError('primary unavailable'), tokens]):
            self.assertEqual(market.spot_price('SOLVBTC')['value'], 200)
        market.CACHE.clear()
        tokens['items'][0]['decimals'] = 7
        with patch.object(market, 'request', side_effect=[OSError('primary unavailable'), tokens]):
            self.assertIsNone(market.spot_price('SOLVBTC'))

    def test_daily_nav_and_invalid_request(self):
        data = {'kind': 'candles', 'rows': [{'time': int(time.time()) - 100, 'open': 1, 'high': 1, 'low': 1, 'close': 1}]}
        with patch.object(market, 'nav_history', return_value=data), patch.object(market, 'spot_price', return_value=None):
            self.assertEqual(market.history('EUTBL', '1m')['interval'], '1D')
        for asset, interval in [('USDC', '1H'), ('unregistered', '1H'), ('XLM', 'invalid')]:
            with self.assertRaises(ValueError):
                market.history(asset, interval)


if __name__ == '__main__':
    unittest.main()
