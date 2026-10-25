const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ window:{NestScreens:{},NestBinders:{},NestUI:{escape:value=>String(value??'')}}, document:{addEventListener(){}},location:{hash:''},URL,URLSearchParams });
for(const file of ['logos.js','research-ui.js','screens/research.js','protocol-context.js','raven-catalog.js','screens/discovery.js','screens/mcp-contents.js']) vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
const provenance=JSON.parse(fs.readFileSync(path.join(root,'spec/logo-provenance.json'),'utf8'));
const checked=[];
for(const node of context.window.NestResearchNodes){
 const markup=context.window.NestUI.logo(node.name),asset=markup.match(/src="([^"]+)"/)?.[1];
 assert.ok(asset,'Missing logo mapping: '+node.name);
 const raw=fs.readFileSync(path.join(root,asset)),record=provenance.assets.find(a=>a.file===asset);
 assert.ok(record,'Missing source provenance: '+node.name);
 assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),record.sha256);
 checked.push({project:node.name,asset,source:record.source_asset_url});
}
console.log(JSON.stringify({result:'passed',projects:checked.length,checked},null,2));
