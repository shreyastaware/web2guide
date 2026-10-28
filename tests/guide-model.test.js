import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {guideModel, selectedPath, completedSteps, validateQuery, STAGES, waitEstimate, guideSummary, summaryPath, timeBucket, exactTime, agentPromptText} from '../public/guide-model.js';
import {normalizeGuide} from '../server/research.js';
const guides=JSON.parse(fs.readFileSync(new URL('../data/guides.json',import.meta.url),'utf8'));

test('old saved guides render without fabricated approval, durations, or verification',()=>{
  const old=guideModel({name:'Legacy',effort:'2 hours, estimate',approval:'Review may apply',steps:[{title:'Register the app',detail:'Enter the app name.'},{title:'Test OAuth',detail:'Connect a test user.'}]});
  assert.equal(old.setupTime,'Unknown');assert.equal(old.approvalStatus,'Required');assert.equal(old.difficulty,'Advanced');assert.equal(selectedPath(old).approvalReason,'Provider review');
  assert.equal(old.steps[0].stage,'Create');assert.deepEqual(old.steps[0].instructions,['Enter the app name.']);
  assert.match(old.steps[0].verify,/does not specify/);
  assert.equal(completedSteps(old.steps,[0]).length,1);
  assert.equal(old.effortEstimate,'2 hours');assert.equal(old.timeEstimate,'2 hours');assert.equal(old.steps[0].owner,'You');assert.equal(old.steps[0].time,'15 min');assert.deepEqual(old.agentCan,[]);
});

test('effort estimates, step owners, and agent handoff are exposed without inventing review waits',()=>{
  for(const raw of guides){
    const guide=guideModel(raw);
    assert.ok(guide.effortEstimate,raw.slug);assert.ok(guide.agentCan.length);assert.ok(guide.humanMust.length);
    assert.ok(guide.steps.every(step=>['You','Agent','Agent + you'].includes(step.owner)));
    assert.equal(guide.reviewWait,'Unknown');
  }
  const long=guideModel({name:'Long',effort:'Register an app, choose scopes, implement the flow, then test it on production endpoints.',steps:[{title:'Wait',time:'Unknown',owner:'Robot'}]});
  assert.equal(long.effortEstimate,'');assert.equal(long.timeEstimate,'4.5 hours');assert.equal(long.steps[0].time,'15 min');assert.equal(long.steps[0].owner,'You');
});

test('curated guides provide complete structured actions in stage order',()=>{
  for(const raw of guides){
    const guide=guideModel(raw),path=selectedPath(guide);
    assert.ok(guide.description);assert.equal(guide.setupTime,'Unknown');
    for(const step of guide.steps){
      assert.ok(step.instructions.length);assert.ok(step.where.label);assert.match(step.where.url,/^https:/);assert.ok(step.verify);assert.ok(step.sourceIds.length);
    }
    const stages=path.steps.map(step=>STAGES.indexOf(step.stage));
    assert.deepEqual(stages,[...stages].sort((a,b)=>a-b));
    assert.equal(new Set(guide.steps.map(step=>step.key)).size,guide.steps.length);
  }
});

test('Slack goal separates own workspace, pilot distribution, and commercial review',()=>{
  const guide=guideModel(guides.find(guide=>guide.slug==='slack'));
  const own=selectedPath(guide,'own'),pilot=selectedPath(guide,'pilot'),publicPath=selectedPath(guide,'public');
  assert.equal(pilot.approvalStatus,'Not Required');assert.equal(publicPath.approvalReason,'Marketplace review');
  assert.equal(own.approvalStatus,'Not Required');assert.ok(own.steps.every(step=>step.stage!=='Launch'));
  assert.ok(pilot.steps.some(step=>step.launchKind==='distribution'));assert.ok(pilot.steps.every(step=>step.launchKind!=='approval'));
  assert.equal(publicPath.approvalStatus,'Required');assert.ok(publicPath.steps.some(step=>step.launchKind==='approval'));
  assert.match(publicPath.reviewWait,/10 business days/);
  const saved=[0,1,2,3,4];
  assert.equal(completedSteps(own.steps,saved).length,2); // Hidden launch work never inflates progress.
});

test('Notion optional listing is hidden for customer OAuth and shown for Marketplace',()=>{
  const guide=guideModel(guides.find(guide=>guide.slug==='notion'));
  const customers=selectedPath(guide,'customers'),marketplace=selectedPath(guide,'marketplace');
  assert.equal(customers.approvalStatus,'Not Required');assert.equal(customers.reviewWait,'Unknown');
  assert.ok(customers.steps.every(step=>!step.goalIds.includes('marketplace')));
  assert.equal(marketplace.approvalStatus,'Required');assert.match(marketplace.reviewWait,/initial|Initial/);
  assert.ok(marketplace.steps.some(step=>step.stage==='Launch'));
  assert.equal(selectedPath(guide,'removed-goal').goal.id,'customers');
});

test('structured generated fields survive normalization and reject unsafe URLs and unsupported timing',()=>{
  const raw={name:'Test',approvalStatus:'Required',approvalSourceIds:['bad'],setupTime:'5 minutes',setupTimeSourceIds:[],sources:[{id:'docs',url:'https://example.com/oauth'}],goals:[{id:'public',label:'Public users',approvalStatus:'Required',sourceIds:['docs'],reviewWait:'2 days',reviewSourceIds:[]}],steps:[{title:'Set redirect URL',stage:'Configure',where:{label:'Settings',url:'javascript:alert(1)'},instructions:['Add callback.'],values:[{label:'Redirect URI',value:'https://app.example/callback'}],verify:'Callback is saved.',sourceIds:['docs','bad'],goalIds:['public']}]};
  const normalized=normalizeGuide(raw,'Test'),guide=guideModel(normalized);
  assert.equal(guide.steps[0].where.url,'');assert.deepEqual(guide.steps[0].instructions,['Add callback.']);
  assert.equal(guide.steps[0].values[0].value,'https://app.example/callback');assert.deepEqual(guide.steps[0].sourceIds,['docs']);
  assert.equal(guide.approvalStatus,'Required');assert.equal(guide.setupTime,'Unknown');
  assert.equal(guide.goals[0].approvalStatus,'Required');assert.equal(guide.goals[0].reviewWait,'Unknown');
});

test('query validation handles app names, websites, and malformed URLs',()=>{
  for(const input of ['Slack','https://linear.app','google.com','应用']) assert.equal(validateQuery(input),'');
  for(const input of ['', 'x', '<script>', '!!', 'https://', 'ftp://example.com','https://user:secret@example.com']) assert.ok(validateQuery(input));
});

test('every guide shows a setup time, a wait, and a library time bucket',()=>{
  const slack=guideModel(guides.find(guide=>guide.slug==='slack'));
  assert.equal(waitEstimate(slack,selectedPath(slack,'own')),'');
  assert.equal(waitEstimate(slack,selectedPath(slack,'public')),'8 weeks');
  const bare=guideModel({name:'Bare',approvalStatus:'Required',steps:[{title:'Submit for review'}]});
  assert.equal(bare.difficulty,'Advanced');assert.equal(bare.timeEstimate,'4.5 hours');assert.equal(waitEstimate(bare,selectedPath(bare)),'4 weeks');
  assert.deepEqual(guides.map(guide=>timeBucket(summaryPath(guideSummary(guide)).timeEstimate)),['hours','long','long','hours']);
  assert.deepEqual(['30–90 min','1 h 45 min','0–5 days','Weeks'].map(exactTime),['1 hour','1.8 hours','3 days','2 weeks']);
  const generated=normalizeGuide({name:'X',reviewEstimate:'3–5 days',steps:[{title:'Go'}]},'X');
  assert.equal(generated.reviewEstimate,'3–5 days');
});

test('agent steps carry a copyable prompt with docs and hand-off rules; your steps do not',()=>{
  for(const raw of guides){
    const guide=guideModel(raw);
    for(const step of guide.steps){
      if(step.owner==='You'){assert.equal(step.agentPrompt,'');continue;}
      assert.ok(step.agentPrompt.length>40,step.title);assert.ok(step.humanPart,step.title);
      const text=agentPromptText(guide,step);
      assert.match(text,/environment variables/);assert.match(text,/Official docs: https:/);
    }
  }
  const fallback=guideModel({name:'Acme',steps:[{title:'Build the callback',owner:'Agent',instructions:['Exchange the code.'],verify:'Token stored.'}]});
  assert.match(fallback.steps[0].agentPrompt,/Build the callback.*Acme[\s\S]*Exchange the code[\s\S]*Done when: Token stored/);
  const generated=normalizeGuide({name:'X',steps:[{title:'Go',owner:'Agent',agentPrompt:'Write the callback route.',humanPart:'Approve consent.'}]},'X');
  assert.equal(generated.steps[0].agentPrompt,'Write the callback route.');assert.equal(generated.steps[0].humanPart,'Approve consent.');
});

test('provider approval is always binary',()=>{
  for(const raw of guides){const guide=guideModel(raw);for(const goal of [null,...guide.goals]) assert.ok(['Required','Not Required'].includes(selectedPath(guide,goal?.id).approvalStatus));}
  assert.equal(guideModel({name:'Legacy',approvalStatus:'Conditional',steps:[{title:'Go'}]}).approvalStatus,'Required');
  assert.equal(normalizeGuide({name:'X',approvalStatus:'Conditional',steps:[{title:'Go'}]},'X').approvalStatus,'Required');
});

test('a library row shows exactly what its guide page shows, for every use case',()=>{
  for(const raw of guides){
    const guide=guideModel(raw),row=guideSummary(raw);
    for(const goalId of [undefined,...guide.goals.map(goal=>goal.id)]){
      const path=selectedPath(guide,goalId),shown=summaryPath(row,goalId);
      assert.deepEqual([shown.timeEstimate,shown.difficulty,shown.approvalStatus],[path.timeEstimate,path.difficulty,path.approvalStatus],`${raw.slug} ${goalId}`);
    }
  }
  // Agent builders let their users connect, so that is each guide's default path.
  assert.deepEqual(Object.fromEntries(guides.map(raw=>[raw.slug,summaryPath(guideSummary(raw)).approvalStatus])),{github:'Not Required',slack:'Not Required',google:'Required',notion:'Not Required'});
});

test('setup time and difficulty change with the use case',()=>{
  const slack=guideModel(guides.find(guide=>guide.slug==='slack'));
  const own=selectedPath(slack,'own'),publicPath=selectedPath(slack,'public');
  assert.equal(own.difficulty,'Moderate');assert.equal(publicPath.difficulty,'Advanced');
  assert.equal(own.timeEstimate,'3.3 hours');assert.equal(publicPath.timeEstimate,'4.5 hours'); // the 2-week review step counts as wait, not setup
  const generated=normalizeGuide({name:'X',goals:[{id:'a',label:'A',difficulty:'Easy'},{id:'b',label:'B',difficulty:'Wild'}],steps:[{title:'Go'}]},'X');
  assert.deepEqual(generated.goals.map(goal=>goal.difficulty),['Easy','']);
});
