#!/usr/bin/env python3
"""Capture protocol context from Scout, Raven's public upstream (no MCP session).

Refresh: python3 research/data/collect-raven-scout.py
Re-project a saved response cache: add --cache /path/to/cache.json
"""
import argparse
import concurrent.futures
import datetime
import json
import pathlib
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
FIELDS = ('name,slug,shortDescription,status,statusAsOf,statusSourceUrl,statusBasis,'
          'statusCaveat,links,repos,builtBy,scfAwarded,scfTotalAwardedUSD,'
          'scfAmountStatus,scfAsOf,scfSourceUrl,llamaSlugs,types,supportedNetworks,onchain')
QUERIES = {
    'binance-cex': 'Binance', 'aquarius-stellar': 'Aquarius', 'gami-labs': 'Gami Labs',
    'soroswap-amm': 'Soroswap', 'sushi-stellar': 'Sushi', 'templar-protocol': 'Templar',
    'untangled-rwa': 'Untangled', 'xoxno-lending': 'XOXNO',
    'defa-by-invoicemate': 'InvoiceMate', 'vaquita-protocol': 'Vaquita',
    'allbridge-core': 'Allbridge', 'phoenix-defi-hub': 'Phoenix',
    'balanced-exchange': 'Balanced',
}
# Reviewed project identities. Similarity-ranked search results alone are insufficient.
ALIASES = {
    'binance-cex': 'binance', 'soroswap-amm': 'soroswap', 'huma': 'huma',
    'untangled-rwa': 'untangled', 'xoxno-lending': 'xoxno',
    'cex.io': 'cex-io', 'phoenix-defi-hub': 'phoenix', 'vaquita-protocol': 'vaquita',
    'peridot': 'peridot-finance', 'balanced-exchange': 'balanced-network', 'gate': 'gate-io',
}


def fetch(url):
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            result = json.load(response)
        result['_request_url'] = url
        return result
    except Exception as error:
        return {'error': type(error).__name__, '_request_url': url}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=pathlib.Path)
    args = parser.parse_args()
    protocols = json.loads((ROOT / 'research/data/defillama-stellar.json').read_text())['protocols']
    queries = {p['slug']: 'Blend' if p['slug'].startswith('blend-') else
               QUERIES.get(p['slug'], p['name']) for p in protocols}
    if args.cache:
        cache = json.loads(args.cache.read_text())
        results, audits = cache['results'], cache['audits']
    else:
        def search(query):
            url = 'https://stellarlight.xyz/api/projects/search?' + urllib.parse.urlencode(
                {'q': query, 'limit': 10, 'fields': FIELDS})
            return query, fetch(url)
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            results = dict(executor.map(search, dict.fromkeys(queries.values())))
        audits = fetch('https://stellarlight.xyz/api/audits?limit=100')
        # A failed/partial refresh must not replace the previous usable capture.
        if any(r.get('error') or r.get('meta', {}).get('partial') for r in results.values()) or audits.get('error'):
            raise RuntimeError('Incomplete Scout refresh; previous snapshot preserved.')
        if len(audits.get('audits', [])) < audits.get('meta', {}).get('counts', {}).get('matched', 0):
            raise RuntimeError('Audit registry needs pagination; previous snapshot preserved.')
        cache_dir = ROOT / '.nest'
        cache_dir.mkdir(exist_ok=True)
        (cache_dir / 'protocol-source-cache.json').write_text(json.dumps({'results': results, 'audits': audits}))
    records = {}
    for protocol in protocols:
        slug = protocol['slug']
        query = queries[slug]
        result = results.get(query, {})
        candidates = result.get('projects', [])
        exact = [p for p in candidates if slug in (p.get('llamaSlugs') or [])]
        matches = exact or [p for p in candidates if p.get('slug') == ALIASES.get(slug, slug)]
        project = matches[0] if len(matches) == 1 else None
        record = {
            'status': 'matched' if project else 'unavailable' if result.get('error') else 'unmatched',
            'query': query, 'source_url': result.get('_request_url') or
            'https://stellarlight.xyz/api/projects/search?' + urllib.parse.urlencode({'q': query, 'limit': 10}),
            'observed_at': result.get('meta', {}).get('generatedAt'),
            'match_basis': 'defillama-slug' if exact else 'reviewed-project-identity' if project else None,
        }
        if project:
            record['project'] = {k: project.get(k) for k in [
                'name', 'slug', 'url', 'shortDescription', 'status', 'statusAsOf', 'statusSourceUrl',
                'statusBasis', 'statusCaveat', 'links', 'builtBy', 'scfAwarded', 'scfTotalAwardedUSD',
                'scfAmountStatus', 'scfAsOf', 'scfSourceUrl', 'llamaSlugs', 'types', 'supportedNetworks']}
            record['scope'] = 'project_family' if project['slug'] != slug or len(project.get('llamaSlugs') or []) > 1 else 'project'
            record['repos'] = [{k: repo.get(k) for k in ['fullName', 'url', 'primaryLanguage', 'lastCommitAt']}
                               for repo in project.get('repos', [])]
            onchain = project.get('onchain') or {}
            record['contracts'] = [{k: c.get(k) for k in ['address', 'label', 'verifiedRepo']}
                                   for c in onchain.get('contracts', [])]
            record['contracts_as_of'] = onchain.get('asOf')
            record['audits'] = [{k: audit.get(k) for k in ['title', 'reportUrl', 'auditor', 'publishedAt', 'dateBasis']}
                                for audit in audits.get('audits', []) if audit.get('projectSlug') == project['slug']]
            record['audits_observed_at'] = audits.get('meta', {}).get('generatedAt')
        records[slug] = record
    output = {
        'schema_version': 'nest.protocol.context.v1',
        'captured_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'provider': 'Scout / Stellar Light', 'source_family': 'Raven Scout',
        'access_method': 'public_upstream_api', 'mcp_connected': False,
        'documentation': 'https://raven.stellar.org/docs',
        'records': records,
    }
    ui = ROOT / 'design/nest/ui'
    (ui / 'spec/protocol-context.json').write_text(json.dumps(output, indent=2) + '\n')
    (ui / 'protocol-context.js').write_text('window.NestProtocolContext=' + json.dumps(output, separators=(',', ':')) + ';\n')
    print(json.dumps({'protocols': len(records), 'matched': sum(r['status'] == 'matched' for r in records.values()),
                      'access_method': output['access_method'], 'mcp_connected': False}))


if __name__ == '__main__':
    main()
