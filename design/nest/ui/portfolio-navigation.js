/* A position keeps its identity when entering its market's management controls. */
(() => {
  const route = position => {
    if (position.kind === 'wallet' && window.NestMarketAssetIds?.includes(position.asset))
      return '#trade?' + new URLSearchParams({ asset: position.asset, view: 'manage' });
    if (['supply', 'borrow'].includes(position.kind)) {
      const record = window.NestCreditPositions?.find(position.positionId);
      if (!record || record.kind !== (position.kind === 'borrow' ? 'loan' : 'supply')) return null;
      return '#positions?' + new URLSearchParams({ position: record.id, view: 'manage' });
    }
    if (position.kind === 'vault' && window.NestVaultProductIds?.includes(position.productId))
      return '#vault-detail?' + new URLSearchParams({ product: position.productId, view: 'manage' });
    if (position.kind === 'lp' && typeof position.poolId === 'string' && position.poolId.trim())
      return '#liquidity-detail?' + new URLSearchParams({ pool: position.poolId, view: 'manage' });
    return null;
  };
  const legacy = hash => {
    const name = hash.replace(/^#/, '').split('?')[0];
    return ['fund', 'transfer'].includes(name) ? '#portfolio' : name === 'vault-management'
      ? '#vault-detail?product=gami&view=manage' : null;
  };
  function focus(root) {
    if (!root?.isConnected || new URLSearchParams(location.hash.split('?')[1] || '').get('view') !== 'manage') return;
    const target = root.querySelector('[data-position-management]');
    if (!target) return;
    target.scrollIntoView({ block: 'start', behavior: 'instant' });
    target.focus({ preventScroll: true });
  }
  window.NestPortfolioNavigation = { route, legacy, focus };
})();
