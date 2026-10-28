import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';

async function freePort(){return await new Promise((resolve,reject)=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port))});s.on('error',reject)})}
async function waitFor(port){for(let i=0;i<40;i++){try{const r=await fetch(`http://127.0.0.1:${port}/api/health`);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,50))}throw Error('Test server did not start')}

test('end-to-end: unfamiliar app gets researched, persisted, and served at a shareable URL',async()=>{
 const apiPort=await freePort(),port=await freePort(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'authpath-test-'));
 const mockGuide={name:'Zinc Tasks',category:'Productivity',website:'https://example.com',difficulty:'Uncertain',effort:'Unknown',approval:'Unknown',confidence:'Low',summary:'Test-generated guide with explicitly unknown approval.',decision:'Verify official docs.',branches:[{name:'Unverified path',time:'Unknown',detail:'Consult provider.'}],requirements:[{title:'OAuth client',detail:'Check docs',sourceIds:[]}],steps:[{title:'Investigate',detail:'Read docs',owner:'Human + agent',time:'Unknown',sourceIds:[]}],blockers:[{problem:'Unclear registration',solution:'Ask provider support.'}],agentCan:['Investigate docs'],humanMust:['Register app'],unknowns:['Approval timeline unknown'],sources:[]};
 const mock=http.createServer(async(req,res)=>{if(req.url==='/v1/responses'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(mockGuide)}]}]}))}else{res.statusCode=404;res.end()}});
 await new Promise(r=>mock.listen(apiPort,'127.0.0.1',r));
 const child=spawn(process.execPath,['server/index.js'],{cwd:path.resolve(import.meta.dirname,'..'),env:{...process.env,PORT:String(port),DATA_DIR:dir,OPENAI_API_KEY:'mock-test-key',OPENAI_RESPONSES_URL:`http://127.0.0.1:${apiPort}/v1/responses`},stdio:'pipe'});
 try{
  await waitFor(port);
  const r=await fetch(`http://127.0.0.1:${port}/api/research`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'Zinc Tasks',useCase:'Create tasks'})});
  assert.equal(r.status,200);
  const stream=await r.text();
  assert.match(stream,/event: step/);assert.match(stream,/event: complete/);
  const last=stream.match(/event: complete\ndata: ([^\n]+)/);
  assert.ok(last);
  const {slug}=JSON.parse(last[1]);
  const detail=await fetch(`http://127.0.0.1:${port}/api/guides/${slug}`);
  assert.equal(detail.status,200);
  const g=await detail.json();assert.equal(g.name,'Zinc Tasks');assert.ok(g.unknowns.some(s=>s.includes('no authenticated provider setup')));
  const page=await fetch(`http://127.0.0.1:${port}/guides/${slug}`);
  assert.equal(page.status,200);assert.match(await page.text(),/Web2Guide/);
  assert.ok(fs.existsSync(path.join(dir,'generated.json')));
  for(const route of ['/','/guides','/guides/','/research']){
   const response=await fetch(`http://127.0.0.1:${port}${route}`);
   assert.equal(response.status,200);assert.match(await response.text(),/Web2Guide/);
  }
  const module=await fetch(`http://127.0.0.1:${port}/guide-model.js`);
  assert.equal(module.status,200);assert.match(module.headers.get('content-type'),/javascript/);
  const list=await (await fetch(`http://127.0.0.1:${port}/api/guides`)).json();
  assert.equal(list.find(g=>g.slug==='slack').approvalStatus,'Conditional');
  assert.equal(list.find(g=>g.slug==='github').description.includes('GitHub'),true);
 }finally{child.kill();mock.close();fs.rmSync(dir,{recursive:true,force:true})}
});
