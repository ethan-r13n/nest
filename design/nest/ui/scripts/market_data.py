#!/usr/bin/env python3
"""Read-only localhost chart adapter. Keys stay in the environment or ignored .dev.vars."""
import argparse
import bisect
import csv
import datetime as dt
import io
import json
import math
import os
from pathlib import Path
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

UI = Path(__file__).resolve().parents[1]
REPO = UI.parents[2]
REGISTRY = json.loads((UI / 'spec/trade-assets.json').read_text())['assets']
PERIODS = {'1m': 60, '5m': 300, '15m': 900, '1H': 3600, '4H': 14400, '1D': 86400}
AQUA = 'https://amm-api.aqua.network'
AQUA_POOL = 'CA6GAFOJCW4MGQQBUCQUSA3CLIH25G4SNKB2JHYKZCVWZTNW5VXMSC4O'
CACHE = {}
LOCK = threading.RLock()


def cached(key, ttl, build):
    # Serialize misses: repeated browsers must not multiply upstream requests.
    with LOCK:
        current = CACHE.get(key)
        if current and time.time() - current[0] < ttl:
            return current[1]
        value = build()
        CACHE[key] = (time.time(), value)
        return value


def secret():
    value = os.environ.get('SOROSWAP_API_KEY', '')
    path = REPO / '.dev.vars'
    if not value and path.exists():
        for line in path.read_text().splitlines():
            if line.startswith('SOROSWAP_API_KEY='):
                value = line.split('=', 1)[1].strip().strip('\"\'')
                break
    return value


def request(url, *, auth=False, text=False):
    headers = {'User-Agent': 'Mozilla/5.0 NestMarketData/1.0', 'Accept': 'application/json'}
    if url.startswith(AQUA):
        headers['Referer'] = 'https://aqua.network/'
    if 'spiko.io' in url:
        headers['Referer'] = 'https://docs.spiko.io/'
    if text:
        headers['Accept'] = 'text/csv'
    if auth:
        key = secret()
        if not key:
            raise ValueError('Soroswap read access is not configured')
        headers['Authorization'] = 'Bearer ' + key
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=20) as response:
        raw = response.read(4_000_001)
        if len(raw) > 4_000_000:
            raise ValueError('Upstream response is too large')
        return raw.decode() if text else json.loads(raw)


def timestamp(value):
    return int(dt.datetime.fromisoformat(value.replace('Z', '+00:00')).replace(tzinfo=dt.timezone.utc).timestamp())


def positive(value):
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise ValueError('Invalid price')
    return number


def normalize_prices(base, quote, tolerance):
    """Match actual observations, without assuming USDC=$1 or filling missing history."""
    counter = sorted((int(p['timestamp']), positive(p['price'])) for p in quote)
    times = [p[0] for p in counter]
    rows = {}
    for point in base:
        stamp = int(point['timestamp'])
        if stamp > time.time() + 60 or not times:
            continue
        index = bisect.bisect_left(times, stamp)
        candidates = [i for i in (index - 1, index) if 0 <= i < len(counter)]
        closest = min(candidates, key=lambda i: abs(counter[i][0] - stamp))
        if abs(counter[closest][0] - stamp) <= tolerance:
            rows[stamp] = {'time': stamp, 'value': positive(point['price']) / counter[closest][1]}
    return [rows[t] for t in sorted(rows)]


def observation_candles(observations, interval):
    """Observed OHLC only: no previous-close interpolation, gaps or invented volume."""
    points = {}
    for point in observations:
        stamp = int(point['time'])
        if stamp <= 0 or stamp > time.time() + 60:
            continue
        points[stamp] = positive(point['value'])
    buckets = {}
    for stamp, value in sorted(points.items()):
        bucket = stamp // PERIODS[interval] * PERIODS[interval]
        row = buckets.setdefault(bucket, {'time': bucket, 'open': value, 'high': value, 'low': value, 'close': value, 'samples': 0})
        row.update(high=max(row['high'], value), low=min(row['low'], value), close=value, samples=row['samples'] + 1)
    return [buckets[t] for t in sorted(buckets)]


def oracle_history(asset, interval):
    step = PERIODS[interval]
    sampling = {'1m': '1m', '5m': '1m', '15m': '5m', '1H': '15m', '4H': '1h', '1D': '6h'}[interval]
    sample_step = {'1m': 60, '5m': 300, '15m': 900, '1h': 3600, '6h': 21600}[sampling]
    end = int(time.time())
    start = end // step * step - 179 * step
    count = (end - start) // sample_step + 1
    coins = REGISTRY[asset]['oracle'] + ',coingecko:usd-coin'
    observations = []
    # Two coins * 240 observations stays below the provider's 500-point request limit.
    for offset in range(0, count, 240):
        size = min(240, count - offset)
        query = urllib.parse.urlencode({'start': start + offset * sample_step, 'span': size, 'period': sampling, 'searchWidth': str(max(10, sample_step // 120)) + 'm'})
        url = 'https://coins.llama.fi/chart/' + coins + '?' + query
        data = cached(url, 60 if offset + size == count else 3600, lambda: request(url))['coins']
        observations.extend(normalize_prices(data.get(REGISTRY[asset]['oracle'], {}).get('prices', []), data.get('coingecko:usd-coin', {}).get('prices', []), max(600, sample_step // 2)))
    rows = observation_candles(observations, interval)
    note = {'SOLVBTC': 'BTC underlying reference; not SolvBTC redemption NAV.', 'USDT0': 'USDT underlying reference; not a bridge redemption quote.'}.get(asset, 'Underlying asset reference prices.')
    return {'kind': 'candles', 'candleBasis': 'observations', 'volumeAvailable': False, 'rows': rows, 'source': 'DefiLlama price oracle', 'sourceUrl': 'https://api-docs.defillama.com/', 'note': 'Sampled-price OHLC; ranges reflect available observations. ' + note, 'cadence': interval}


def aqua_candles(events, interval):
    base = REGISTRY['AQUA']['contract']
    quote = REGISTRY['USDC']['contract']
    trades = {}
    for event in events:
        if event.get('event_type') != 'swap':
            continue
        amounts = dict(zip(event.get('tokens', []), event.get('amounts', [])))
        if base not in amounts or quote not in amounts:
            continue
        a, b = float(amounts[base]), float(amounts[quote])
        if not math.isfinite(a + b) or a * b >= 0:
            continue
        stamp = timestamp(event['ledger_close_at_str'])
        if stamp > time.time() + 60:
            continue
        identity = (event.get('transaction_hash'), event.get('ledger'), tuple(event.get('amounts', [])))
        trades[identity] = (stamp, positive(abs(b / a)), abs(a) / 10 ** REGISTRY['AQUA']['decimals'])
    buckets = {}
    for stamp, price, volume in sorted(trades.values()):
        bucket = stamp // PERIODS[interval] * PERIODS[interval]
        row = buckets.setdefault(bucket, {'time': bucket, 'open': price, 'high': price, 'low': price, 'close': price, 'volume': 0})
        row.update(high=max(row['high'], price), low=min(row['low'], price), close=price, volume=row['volume'] + volume)
    return [buckets[t] for t in sorted(buckets)]


def aqua_history(interval):
    url = AQUA + '/events/pool/' + AQUA_POOL + '/?size=500&event_type__in=swap'
    data = cached('aqua-events', 60, lambda: request(url))
    return {'kind': 'candles', 'candleBasis': 'trades', 'volumeAvailable': True, 'rows': aqua_candles(data['items'], interval), 'source': 'Aquarius swap records', 'sourceUrl': 'https://aqua.network/pools/' + AQUA_POOL + '/', 'note': 'Latest 500 pool swaps. Gaps are periods without recorded trades; volume covers this sample.', 'cadence': interval}


def nav_history():
    start = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=100)).date().isoformat()
    nav = cached('eutbl-nav', 3600, lambda: request('https://public-api.spiko.io/v0/net-asset-values/EUTBL?startDay=' + start))
    fx = cached('eur-usd-fx', 3600, lambda: request('https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?startPeriod=' + start + '&format=csvdata', text=True))
    rates = sorted((row['TIME_PERIOD'], positive(row['OBS_VALUE'])) for row in csv.DictReader(io.StringIO(fx)))
    days = [r[0] for r in rates]
    end = int(time.time()) // 86400 * 86400
    usd = cached('usdc-daily', 3600, lambda: request('https://coins.llama.fi/chart/coingecko:usd-coin?start=' + str(end - 102 * 86400) + '&span=103&period=1d')['coins']['coingecko:usd-coin']['prices'])
    observations = []
    for point in nav:
        if point['amount']['currency'] != 'EUR':
            continue
        day = point['day'][:10]
        index = bisect.bisect_right(days, day) - 1
        # Use the most recent published fixing, including weekends, never a future fixing.
        if index >= 0 and (dt.date.fromisoformat(day) - dt.date.fromisoformat(days[index])).days <= 4:
            observations.append({'timestamp': timestamp(point['day']), 'price': positive(point['amount']['value']) * rates[index][1]})
    return {'kind': 'candles', 'candleBasis': 'nav', 'volumeAvailable': False, 'rows': observation_candles(normalize_prices(observations, usd, 43200), '1D'), 'source': 'Spiko NAV · ECB EUR/USD', 'sourceUrl': 'https://docs.spiko.io/developers/public_api/getting_started/', 'note': 'Daily NAV candles; one observation has equal O/H/L/C. EUR NAV converted with the last published ECB fixing and observed USDC/USD.', 'cadence': '1D'}


def spot_price(asset):
    try:
        coins = ','.join(a['contract'] for a in REGISTRY.values())
        prices = cached('soroswap-spot', 45, lambda: request('https://api.soroswap.finance/price?network=mainnet&asset=' + coins, auth=True))
        values = {r['asset']: r for r in prices}
        base, quote = values[REGISTRY[asset]['contract']], values[REGISTRY['USDC']['contract']]
        return {'value': positive(base['price']) / positive(quote['price']), 'source': 'Soroswap', 'time': min(timestamp(base['timestamp']), timestamp(quote['timestamp']))}
    except (KeyError, ValueError, OSError, TypeError):
        pass
    try:
        data = cached('aquarius-spot', 60, lambda: request(AQUA + '/tokens/?pooled=true&size=500'))
        values = {r['address']: r for r in data['items']}
        base, quote = values[REGISTRY[asset]['contract']], values[REGISTRY['USDC']['contract']]
        base_decimals, quote_decimals = REGISTRY[asset]['decimals'], REGISTRY['USDC']['decimals']
        if int(base.get('decimals', base_decimals)) != base_decimals or int(quote.get('decimals', quote_decimals)) != quote_decimals:
            raise ValueError('Token decimals do not match the registered asset')
        # Aquarius price_xlm is normalized to seven raw decimals, including for 8-decimal tokens.
        value = positive(base['price_xlm']) / positive(quote['price_xlm']) * 10 ** (base_decimals - quote_decimals)
        return {'value': value, 'source': 'Aquarius', 'time': None}
    except (KeyError, ValueError, OSError, TypeError):
        return None


def history(asset, interval):
    if asset not in REGISTRY or asset == 'USDC' or interval not in PERIODS:
        raise ValueError('Choose a supported asset and interval')
    if asset == 'EUTBL':
        interval = '1D'
    def build():
        if asset == 'AQUA':
            data = aqua_history(interval)
        elif asset == 'EUTBL':
            data = nav_history()
        else:
            data = oracle_history(asset, interval)
        if not data['rows']:
            raise ValueError('The source returned no price history for this interval')
        return {**data, 'asset': asset, 'quote': 'USDC', 'interval': interval, 'fetchedAt': int(time.time()), 'spot': spot_price(asset)}
    return cached(('history', asset, interval), 60, build)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        host = self.headers.get('Host', '')
        origin = self.headers.get('Origin', '')
        if host not in ('127.0.0.1:8766', 'localhost:8766') or origin and origin not in ('http://127.0.0.1:8765', 'http://localhost:8765'):
            self.send_error(403)
            return
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path != '/api/market-history':
            self.send_error(404)
            return
        args = urllib.parse.parse_qs(parsed.query)
        try:
            result = history(args.get('asset', ['XLM'])[0], args.get('interval', ['1H'])[0])
            status = 200
        except ValueError as error:
            result, status = {'error': str(error)}, 400
        except Exception:
            # No upstream response body, request headers or keys are ever sent to the browser.
            result, status = {'error': 'Market history provider is unavailable. Retry shortly.'}, 503
        raw = json.dumps(result, allow_nan=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(raw)))
        if origin:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.end_headers()
        self.wfile.write(raw)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--snapshot', action='store_true', help='Capture real default-interval history for offline preview')
    args = parser.parse_args()
    if args.snapshot:
        data = {}
        for asset in REGISTRY:
            if asset == 'USDC':
                continue
            data[asset] = history(asset, '1D' if asset == 'EUTBL' else '1H')
            print(asset, len(data[asset]['rows']), data[asset]['source'], flush=True)
        (UI / 'trade-market-history.json').write_text(json.dumps(data, separators=(',', ':'), allow_nan=False) + '\n')
    else:
        print('Nest read-only chart data: http://127.0.0.1:8766', flush=True)
        ThreadingHTTPServer(('127.0.0.1', 8766), Handler).serve_forever()
