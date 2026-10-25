#!/usr/bin/env python3
"""Project the existing DeFiLlama Stellar pool capture into the buildless preview."""
import json
import pathlib

root = pathlib.Path(__file__).resolve().parents[2]
source = json.loads((root / 'research/data/defillama-stellar.json').read_text())
fields = ['pool_id', 'chain', 'project', 'symbol', 'pool_meta', 'tvl_usd',
          'total_apy_pct', 'base_apy_pct', 'reward_apy_pct', 'apy_mean_30d_pct', 'observed_at']
output = {
    'schema_version': 'nest.protocol.yields.v1', 'provider': 'DeFiLlama',
    'source_url': 'https://yields.llama.fi/pools',
    'captured_at': source['captured_at'], 'live': False,
    'pools': [{key: pool.get(key) for key in fields}
              for pool in source['yield_pools'] if pool['chain'] == 'Stellar'],
}
ui = root / 'design/nest/ui'
(ui / 'spec/protocol-yields.json').write_text(json.dumps(output, indent=2) + '\n')
(ui / 'protocol-yields.js').write_text('window.NestProtocolYields=' + json.dumps(output, separators=(',', ':')) + ';\n')
print(json.dumps({'pools': len(output['pools']), 'projects': sorted({p['project'] for p in output['pools']})}))
