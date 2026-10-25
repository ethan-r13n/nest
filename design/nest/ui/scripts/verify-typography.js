const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const document={title:'Nest — Credit / Borrow',body:{},querySelectorAll:()=>[]};
const context={window:{},document,MutationObserver:class{observe(){}},requestAnimationFrame:()=>0,cancelAnimationFrame(){}};
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../typography.js'),'utf8'),context);
const title=context.window.NestTypography.titleCase;
for(const [input,expected] of [
 ['Borrow on your terms.','Borrow On Your Terms.'],
 ['What would you like to borrow?','What Would You Like To Borrow?'],
 ['Stellar real-world assets','Stellar Real-World Assets'],
 ['USD notional / unrealized P&L','USD Notional / Unrealized P&L'],
 ['DeFi, RWAs and MCP Contents','DeFi, RWAs And MCP Contents'],
 ['xSolvBTC / SolvBTC / USDT0','xSolvBTC / SolvBTC / USDT0'],
 ['XOXNO credit positions','XOXNO Credit Positions'],
 ['WE COULDN’T LOAD THIS VIEW','We Couldn’t Load This View'],
 ['30d EMA / 0.5% slippage','30d EMA / 0.5% Slippage']
])assert.equal(title(input),expected);
const symbolText={nodeType:3,nodeValue:'CETES / USTRY / USDY / ETH / STBL_USST'};
const pairHeading={matches:()=>true,closest:selector=>selector==='[data-preserve-case]'?{}:null,childNodes:[symbolText]};
context.window.NestTypography.apply({querySelectorAll:()=>[pairHeading]});
assert.equal(symbolText.nodeValue,'CETES / USTRY / USDY / ETH / STBL_USST');
const markets=fs.readFileSync(path.resolve(__dirname,'../screens/markets.js'),'utf8');
const liquidity=fs.readFileSync(path.resolve(__dirname,'../screens/liquidity.js'),'utf8');
assert.ok(markets.includes("p.kind==='liquidity'?'data-preserve-case'"),'LP list identities opt out of title casing');
assert.ok(liquidity.includes('<h1 data-preserve-case>'),'LP detail identities opt out of title casing');
console.log(JSON.stringify({result:'passed',checks:['Heading title case','Hyphenated words and contractions','Financial acronyms','Mixed-case asset identities','Uppercase headings','Numeric periods and percentages']},null,2));
