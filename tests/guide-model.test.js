import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {guideModel, selectedPath, completedSteps, validateQuery, STAGES} from '../public/guide-model.js';
import {normalizeGuide} from '../server/research.js';
const guides=JSON.parse(fs.readFileSync(new URL('../data/guides.json',import.meta.url),'utf8'));

test('old saved guides render without fabricated approval, durations, or verification',()=>{
  const old=guideModel({name:'Legacy',effort:'2 hours, estimate',approval:'Review may apply',steps:[{title:'Register the app',detail:'Enter the app name.'},{title:'Test OAuth',detail:'Connect a test user.'}]});
  assert.equal(old.setupTime,'Unknown');assert.equal(old.approvalStatus,'Unknown');
  assert.equal(old.steps[0].stage,'Create');assert.deepEqual(old.steps[0].instructions,['Enter the app name.']);
  assert.match(old.steps[0].verify,/does not specify/);
  assert.equal(completedSteps(old.steps,[0]).length,1);
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
  assert.equal(selectedPath(guide,'removed-goal').goal.id,'own');
});

test('structured generated fields survive normalization and reject unsafe URLs and unsupported timing',()=>{
  const raw={name:'Test',approvalStatus:'Required',approvalSourceIds:['bad'],setupTime:'5 minutes',setupTimeSourceIds:[],sources:[{id:'docs',url:'https://example.com/oauth'}],goals:[{id:'public',label:'Public users',approvalStatus:'Required',sourceIds:['docs'],reviewWait:'2 days',reviewSourceIds:[]}],steps:[{title:'Set redirect URL',stage:'Configure',where:{label:'Settings',url:'javascript:alert(1)'},instructions:['Add callback.'],values:[{label:'Redirect URI',value:'https://app.example/callback'}],verify:'Callback is saved.',sourceIds:['docs','bad'],goalIds:['public']}]};
  const normalized=normalizeGuide(raw,'Test'),guide=guideModel(normalized);
  assert.equal(guide.steps[0].where.url,'');assert.deepEqual(guide.steps[0].instructions,['Add callback.']);
  assert.equal(guide.steps[0].values[0].value,'https://app.example/callback');assert.deepEqual(guide.steps[0].sourceIds,['docs']);
  assert.equal(guide.approvalStatus,'Unknown');assert.equal(guide.setupTime,'Unknown');
  assert.equal(guide.goals[0].approvalStatus,'Required');assert.equal(guide.goals[0].reviewWait,'Unknown');
});

test('query validation handles app names, websites, and malformed URLs',()=>{
  for(const input of ['Slack','https://linear.app','google.com','应用']) assert.equal(validateQuery(input),'');
  for(const input of ['', 'x', '<script>', '!!', 'https://', 'ftp://example.com','https://user:secret@example.com']) assert.ok(validateQuery(input));
});
