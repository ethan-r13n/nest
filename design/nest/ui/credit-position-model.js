/* Display-only position fixtures; these calculations never establish an executable quote. */
(() => {
  'use strict';
  const positions = [
    { id:'blend-loan', venue:'Blend', kind:'loan', market:'XLM / USDC', collateral:10000, collateralAsset:'XLM', collateralPrice:0.17, debt:800, debtAsset:'USDC', apr:6.4, threshold:0.8, nativeMetric:'hf' },
    { id:'xoxno-loan', venue:'XOXNO', kind:'loan', market:'Account #1042', collateral:6500, collateralAsset:'XLM', collateralPrice:0.17, debt:600, debtAsset:'USDC', apr:5.9, threshold:0.75, nativeMetric:'ltv' },
    { id:'blend-supply', venue:'Blend', kind:'supply', market:'USDC supply', supplied:1000, asset:'USDC', assetPrice:1, apr:5.42 },
  ];
  const actions = position => position.kind==='loan'
    ? [['add-collateral','Add collateral'],['withdraw-collateral','Withdraw collateral'],['repay','Repay'],['close','Repay & close']]
    : [['deposit','Add'],['withdraw','Withdraw']];
  const find = id => positions.find(position=>position.id===id);
  const defaults = (position, action) => action==='close' ? String(position.debt) : action==='repay' ? '200' : action==='withdraw-collateral' ? '1000' : position.kind==='loan' ? '500' : '100';
  function balances(position, collateral=position.collateral, debt=position.debt, supplied=position.supplied) {
    if(position.kind==='supply')return {supplied,value:supplied*position.assetPrice};
    const value=collateral*position.collateralPrice;
    return {collateral,debt,value,net:value-debt,ltv:debt===0?0:value>0?debt/value*100:null,
      hf:position.nativeMetric==='hf'&&position.threshold>0&&debt>0?value*position.threshold/debt:null};
  }
  function project(position, action, input) {
    const before=balances(position), errors=[];
    if(!actions(position).some(([key])=>key===action))errors.push('Choose an action available for this position.');
    const amount=action==='close'?position.debt:/^\d+(?:\.\d{1,7})?$/.test(String(input))?Number(input):NaN;
    if(!Number.isFinite(amount)||amount<=0)errors.push('Enter a positive decimal amount, with up to 7 decimal places.');
    if(position.kind==='supply') {
      if(action==='withdraw'&&amount>position.supplied)errors.push('The withdrawal exceeds the supplied balance.');
      const after=errors.length?null:balances(position,undefined,undefined,position.supplied+(action==='deposit'?amount:-amount));
      return {before,after,errors,amount,asset:position.asset};
    }
    let collateral=position.collateral,debt=position.debt;
    if(action==='add-collateral')collateral+=amount;
    if(action==='withdraw-collateral')collateral-=amount;
    if(action==='repay')debt-=amount;
    if(action==='close')debt=0;
    if(collateral<0)errors.push('The withdrawal exceeds the collateral balance.');
    if(debt<0)errors.push('The repayment exceeds the outstanding debt.');
    const candidate=balances(position,collateral,debt);
    if(action==='withdraw-collateral'&&debt>0) {
      if(!(position.threshold>0)||candidate.ltv===null||candidate.ltv>=position.threshold*100)
        errors.push('This withdrawal reaches or breaches the venue liquidation boundary. Repay debt or withdraw less.');
    }
    return {before,after:errors.length?null:candidate,errors,amount,
      asset:['add-collateral','withdraw-collateral'].includes(action)?position.collateralAsset:position.debtAsset};
  }
  function totals() {
    const collateral=positions.filter(p=>p.kind==='loan').reduce((sum,p)=>sum+p.collateral*p.collateralPrice,0);
    const debt=positions.filter(p=>p.kind==='loan').reduce((sum,p)=>sum+p.debt,0);
    const supplied=positions.filter(p=>p.kind==='supply').reduce((sum,p)=>sum+p.supplied*p.assetPrice,0);
    return {collateral,debt,supplied,net:collateral+supplied-debt};
  }
  window.NestCreditPositions={positions,actions,find,defaults,balances,project,totals};
})();
