import test from 'node:test';
import assert from 'node:assert/strict';
import {validInput,slugify,safeUrl,normalizeGuide} from '../server/research.js';
import fs from 'node:fs';
test('blocks empty / injected / huge user input',()=>{
 assert.equal(validInput('Dropbox'),true);assert.equal(validInput('https://linear.app'),true);
 assert.equal(validInput('<script>'),false);assert.equal(validInput('x'.repeat(141)),false);
});
test('limits outbound research sources to public HTTPS URLs',()=>{
 for(const u of ['http://localhost:3001','https://127.0.0.1/a','file:///etc/passwd','https://host.local/a'])assert.equal(safeUrl(u),false);
 assert.equal(safeUrl('https://developers.notion.com/docs/authorization'),true);
});
test('slugs stable and safe',()=>assert.equal(slugify('Linear.app / OAuth'),'linear-app-oauth'));
test('seed guides have source-linked steps and useful launch information',()=>{
 const guides=JSON.parse(fs.readFileSync(new URL('../data/guides.json',import.meta.url),'utf8'));
 assert.ok(guides.length>=4);
 for(const g of guides){assert.ok(g.steps.length>=4);assert.ok(g.blockers.length>=2);assert.ok(g.branches.length>=2);assert.ok(g.agentCan.length);assert.ok(g.humanMust.length);const ids=new Set(g.sources.map(s=>s.id));assert.ok(g.steps.some(step=>step.sourceIds.some(id=>ids.has(id))));}
});
test('research normalization drops invalid source IDs, private URL, and unknown owners',()=>{
 const g=normalizeGuide({name:'Example',steps:[{title:'register',sourceIds:['fake','safe'],owner:'invalid'}],sources:[{id:'safe',url:'https://example.com/help'},{id:'bad',url:'http://localhost:1'}]},'Example');
 assert.equal(g.sources.length,1);assert.deepEqual(g.steps[0].sourceIds,['safe']);assert.equal(g.steps[0].owner,'Human + agent');
});
