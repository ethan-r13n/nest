import { parseRavenCatalog, parseResearchSnapshot } from '@nest/data/research';

import catalogJson from '../../../../research/data/raven-catalog.json' with { type: 'json' };
import snapshotJson from '../../../../research/data/stellar-research-ui.json' with { type: 'json' };

export const research = parseResearchSnapshot(snapshotJson);
export const ravenCatalog = parseRavenCatalog(catalogJson);

export function findProtocol(id: string) {
  return research.protocols.find((protocol) => protocol.id === id || protocol.slug === id);
}

export function findPool(id: string) {
  return research.yieldPools.find((pool) => pool.id === id);
}

export function rwaAssetRouteId(id: string) {
  const encoded = btoa(Array.from(new TextEncoder().encode(id), (byte) => String.fromCharCode(byte)).join(''));
  return `rwa_${encoded.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')}`;
}
