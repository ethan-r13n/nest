/* Local strategy-draft parser for the design preview. Market data is never fabricated. */
(() => {
  'use strict';
  const blank = () => ({ kind:'arbitrage', condition:'', source:'', response:'alert', targetAsset:'', thesis:'', venueA:'', venueB:'', poolA:'', poolB:'', pair:'', threshold:'', sizing:'', amount:'',
    maxImpact:'', costBps:'', days:'', cadence:'', lifetime:'until-paused', durationDays:'', channel:'In Nest', chart:'spread' });
  const numeric = value => value != null && String(value).trim() !== '' && Number.isFinite(Number(value));
  const positive = value => numeric(value) && Number(value) > 0;
  const missing = (d, mode) => {
    const fields = [];
    if (!d.thesis.trim()) fields.push('thesis');
    if (d.kind !== 'arbitrage') {
      if (!d.condition.trim()) fields.push('signalCondition');
      if (!d.source.trim()) fields.push('signalSource');
      if (!['alert','review'].includes(d.response) || d.response === 'review' && !d.targetAsset) fields.push('signalResponse');
      if (d.response === 'review' && (d.sizing !== 'fixed' || !positive(d.amount))) fields.push('signalSizing');
      if (mode === 'backtest') { if (!positive(d.days) || Number(d.days)>3650) fields.push('period'); if(d.response==='review' && (!numeric(d.costBps)||Number(d.costBps)<0)) fields.push('costs'); }
      else { if(!positive(d.cadence)||Number(d.cadence)<30) fields.push('cadence'); if(d.lifetime!=='until-paused'&&(!positive(d.durationDays)||Number(d.durationDays)>3650)) fields.push('duration'); }
      return fields;
    }
    if (!d.venueA.trim() || !d.venueB.trim() || !d.poolA.trim() || !d.poolB.trim() || d.poolA.trim() === d.poolB.trim()) fields.push('pools');
    if (!/^[A-Z0-9]{2,12}\/[A-Z0-9]{2,12}$/.test(d.pair) || d.pair.split('/')[0] === d.pair.split('/')[1]) fields.push('pair');
    if (!positive(d.threshold)) fields.push('threshold');
    if (!['fixed','capacity'].includes(d.sizing) || d.sizing === 'fixed' && !positive(d.amount)) fields.push('sizing');
    if (!positive(d.maxImpact) || Number(d.maxImpact) > 100) fields.push('impact');
    if (mode === 'backtest') {
      if (!positive(d.days) || Number(d.days) > 3650) fields.push('period');
      if (!numeric(d.costBps) || Number(d.costBps) < 0) fields.push('costs');
    } else {
      if (!positive(d.cadence) || Number(d.cadence) < 30) fields.push('cadence');
      if (d.lifetime !== 'until-paused' && (!positive(d.durationDays) || Number(d.durationDays) > 3650)) fields.push('duration');
    }
    return fields;
  };
  const questions = {
    signalCondition:'State the exact crossing condition, candle interval and comparison window. Reply “Condition: …”.',
    signalSource:'Which provider and market should supply the observations? Reply “Source: …” with the candle feed, volume market or lending venues. Source identity will need validation before a run.',
    signalResponse:'Should this send an alert, or propose a specific asset purchase for your review?',
    signalSizing:'What fixed USDC amount should the proposed purchase use? For example, 1,000 USDC. It will still require your review.',
    thesis:'What would you like to test or watch? Describe your thesis in your own words.',
    pools:'Which exact two pools should I compare? Add both venue names and their pool links or contract IDs. You can paste “Pool A: …” and “Pool B: …”.',
    pair:'Which asset pair should both pools quote? For example, XLM/USDC. I’ll compare the same quote currency.',
    threshold:'What price divergence should trigger the strategy? Give a percentage, such as 1.5%.',
    sizing:'Should I test a fixed amount, or estimate how much fits? Give an amount in the quote asset (for example, 1,000 USDC), or say “estimate available size”.',
    impact:'What maximum price impact should the sizing allow per leg? For example, 0.5%.',
    period:'How far back should I test? For example, the last 30 or 90 days. I’ll need prices and liquidity for both pools across that window.',
    costs:'What round-trip fee assumption should I use? Give basis points, such as 60 bps for both legs combined. Price impact and network costs still need pool data.',
    cadence:'How often should I check? For example, every 1 or 5 minutes. Actual cadence depends on source availability.',
    duration:'How long should this monitor stay on? Choose until paused or give a number of days.',
  };
  const next = (d, mode) => {
    const fields = missing(d, mode);
    if(fields[0]==='pools'&&d.venueA&&d.venueB) {
      if(d.poolA&&!d.poolB)return `I have the ${d.venueA} pool. What is the exact link or contract ID for the ${d.venueB} pool?`;
      if(d.poolB&&!d.poolA)return `I have the ${d.venueB} pool. What is the exact link or contract ID for the ${d.venueA} pool?`;
      if(d.poolA&&d.poolA===d.poolB)return 'Those are the same pool identity. Which distinct second pool should I compare?';
    }
    if (d.kind!=='arbitrage' && !fields.length) return 'The signal draft is ready for review. Confirm to save its source, rule and time window. Data and rule validation are still required before evaluation or monitoring.';
    if (d.kind!=='arbitrage' && fields[0]==='period') return 'How far back should I evaluate this signal? Give a period such as the last 90 days. The source must also cover the indicator’s warm-up window.';
    return fields.length ? questions[fields[0]] : mode === 'backtest'
      ? 'The setup is ready to review. Confirm to save a backtest request; profitability needs historical pool prices, depth, fees and network costs.'
      : 'The setup is ready to review. Confirm to save the monitor setup, including its cadence and sizing rule.';
  };
  function parse(text, previous, mode) {
    const d = { ...previous };
    const pending = missing(d, mode)[0];
    const input = text.trim();
    const first = !d.thesis;
    if (first) {
      d.thesis = input;
      if (/\bEMA\b|exponential moving average/i.test(input)) d.kind='btc-ema';
      else if (/volume.*(?:break|high|average)|(?:break|high).*volume/i.test(input)) d.kind='volume-breakout';
      else if (/(?:supply|yield|lending).*rate|yield gap/i.test(input)) d.kind='yield-gap';
      if(d.kind!=='arbitrage') d.condition=input;
    }
    if(d.kind!=='arbitrage') {
      const source=input.match(/source\s*[:=]\s*([^;\n]+)/i);
      if(source)d.source=source[1].trim();
      else if(pending==='signalSource' && /^https:\/\//i.test(input))d.source=input;
      const condition=input.match(/condition\s*[:=]\s*([^;\n]+)/i); if(condition)d.condition=condition[1].trim();
      const target=input.match(/(?:buy|long|purchase)\s+([A-Z][A-Z0-9]{1,11})\b/);
      if(target){d.response='review';d.targetAsset=target[1];}
      if(/alerts? only|notify only/i.test(input)){d.response='alert';d.targetAsset='';}
    }
    const commonAssets = new Set(['XLM','USDC','EURC','USDT','USDT0','BTC','WBTC','ETH','WETH','BLND','AQUA','USDY']);
    const pair = [...input.matchAll(/\b([A-Za-z][A-Za-z0-9]{1,11})\s*[/–-]\s*([A-Za-z][A-Za-z0-9]{1,11})\b/g)].find(m =>
      [m[1],m[2]].every(s=>commonAssets.has(s.toUpperCase())) || [m[1],m[2]].every(s=>s===s.toUpperCase()));
    if (pair) d.pair = pair[1].toUpperCase() + '/' + pair[2].toUpperCase();
    const venues = [...input.matchAll(/soroswap|sorososwap|sorosop|aquarius|phoenix|stellar\s*(?:dex|amm)/gi)]
      .map(m => /soro/i.test(m[0]) ? 'Soroswap' : /aqua/i.test(m[0]) ? 'Aquarius' : /phoenix/i.test(m[0]) ? 'Phoenix' : 'Stellar DEX');
    const unique = [...new Set(venues)];
    if (unique.length > 1) [d.venueA, d.venueB] = unique;
    else if (unique.length && !d.venueA) d.venueA = unique[0];
    else if (unique.length && !d.venueB && unique[0]!==d.venueA) d.venueB = unique[0];
    for (const [label,key] of [['a','venueA'],['b','venueB']]) {
      const match=input.match(new RegExp('venue\\s*'+label+'\\s*[:=]\\s*([^;\\n]+)','i'));
      if(match)d[key]=match[1].trim();
    }
    for (const [label, key] of [['a','poolA'], ['b','poolB']]) {
      const match = input.match(new RegExp('pool\\s*' + label + '\\s*[:=]\\s*([^;\\n]+)', 'i'));
      if (match) d[key] = match[1].trim();
    }
    const addresses = input.match(/\bC[A-Z2-7]{55}\b/g) || [];
    const urls = (input.match(/https:\/\/[^\s;]+/g) || []).map(s => s.replace(/[),.]+$/, ''));
    const identities = addresses.length >= 2 ? addresses : urls;
    if (!/pool\s*[ab]\s*[:=]/i.test(input) && identities.length >= 2) [d.poolA,d.poolB] = identities;
    if (!/pool\s*[ab]\s*[:=]/i.test(input) && identities.length===1 && pending==='pools') {
      if(!d.poolA)d.poolA=identities[0];else if(!d.poolB&&identities[0]!==d.poolA)d.poolB=identities[0];
    }
    const threshold = input.match(/(?:divergence|deviance|deviation|spread|threshold|greater than|exceeds?|above)\D{0,24}([\d.]+)\s*%/i);
    if (threshold) d.threshold = threshold[1];
    const impact = input.match(/(?:impact|slippage)(?:\s+(?:of|below|under|at most|limit|is))?\s*[:=]?\s*([\d.]+)\s*%/i);
    if (impact) d.maxImpact = impact[1];
    if (/^[\d.]+\s*%$/.test(input)) {
      if (pending === 'impact') d.maxImpact = input.replace(/[%\s]/g, '');
      else if (pending === 'threshold') d.threshold = input.replace(/[%\s]/g, '');
    }
    if (/(?:estimate|calculate|find|how much|max(?:imum)?)\s+(?:the\s+)?(?:available\s+|trade\s+)?(?:size|capacity)|how much.*(?:fit|trade)|size.*(?:fits|fit)/i.test(input)) d.sizing = 'capacity';
    const quote = d.kind==='arbitrage' ? (d.pair.split('/')[1] || 'USDC') : 'USDC';
    const amount = input.match(new RegExp('(?:\\$\\s*([\\d,]+(?:\\.\\d+)?))|(?:\\b([\\d,]+(?:\\.\\d+)?)\\s*' + quote + '\\b)', 'i'));
    if (amount) { d.amount = (amount[1] || amount[2]).replace(/,/g, ''); d.sizing = 'fixed'; }
    const days = input.match(/(?:last|past|over|for|backtest(?:\s+for)?)\s+(\d+)\s*(days?|weeks?|months?|years?)/i)
      || (pending === 'period' || pending === 'duration' ? input.match(/^(\d+)\s*(days?|weeks?|months?|years?)$/i) : null);
    if (days) {
      const count = Number(days[1]) * (/week/i.test(days[2]) ? 7 : /month/i.test(days[2]) ? 30 : /year/i.test(days[2]) ? 365 : 1);
      if (mode === 'backtest') d.days = String(count);
      else { d.durationDays = String(count); d.lifetime = 'duration'; }
    }
    const costs = input.match(/\b([\d.]+)\s*(?:bps|basis points?)\b/i);
    if (costs) d.costBps = costs[1];
    const cadence = input.match(/(?:every|each|poll(?:\s+every)?)\s*(\d+(?:\.\d+)?)\s*(seconds?|secs?|s\b|minutes?|mins?|m\b|hours?|h\b)/i);
    if (cadence) d.cadence = String(Number(cadence[1]) * (/^(h)/i.test(cadence[2]) ? 3600 : /^(m)/i.test(cadence[2]) ? 60 : 1));
    if (/until (?:i )?(?:pause|paused|stop|stopped)|forever|lifetime|indefinitely/i.test(input)) d.lifetime = 'until-paused';
    return d;
  }
  const summary = (d, mode) => ({
    title: d.kind==='arbitrage' ? `${d.pair || 'Pool price'} divergence` : ({'btc-ema':'BTC momentum → XLM','volume-breakout':'XLM volume breakout','yield-gap':'USDC yield gap'}[d.kind] || 'Signal strategy'),
    trigger: d.kind==='arbitrage' ? `Absolute price divergence above ${d.threshold || '…'}%` : d.condition,
    sizing: d.kind!=='arbitrage' ? (d.response==='review' ? `Propose ${d.amount||'…'} USDC of ${d.targetAsset||'…'} · review required` : 'Alert only · no trade proposed') : d.sizing === 'capacity' ? `Estimate available size at ≤ ${d.maxImpact || '…'}% impact per leg`
      : d.sizing === 'fixed' ? `${d.amount || '…'} ${d.pair.split('/')[1] || 'quote asset'} · ≤ ${d.maxImpact || '…'}% impact per leg` : 'Sizing to be specified',
    window: mode === 'backtest' ? `Last ${d.days || '…'} days` : `Every ${d.cadence || '…'} seconds · ${d.lifetime === 'until-paused' ? 'until paused' : (d.durationDays || '…') + ' days'}`,
  });
  const fingerprint = (d, mode) => { const { chart, ...strategy } = d; return JSON.stringify({ mode, ...strategy }); };
  const validDraft = input => {
    const d = blank();
    if (input && typeof input === 'object') for (const key of Object.keys(d)) if (typeof input[key] === 'string') d[key] = input[key].slice(0,12000);
    if(!['arbitrage','btc-ema','volume-breakout','yield-gap'].includes(d.kind))d.kind='arbitrage';
    return d;
  };
  window.NestLabModel = { blank, missing, next, parse, summary, fingerprint, validDraft };
})();
