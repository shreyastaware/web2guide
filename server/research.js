import { createHash } from 'node:crypto';
import {STAGES, validateQuery} from '../public/guide-model.js';

const SCHEMA = `Return exactly ONE valid JSON object with these keys:
{name:string,category:string,website:string,aliases:string[],description:string,difficulty:"Easy"|"Moderate"|"Advanced",effort:string,setupTime:string,setupTimeSourceIds:string[],approval:string,approvalStatus:"Required"|"Not Required",approvalReason:string,approvalSourceIds:string[],reviewWait:string,reviewSourceIds:string[],reviewEstimate:string,confidence:"High"|"Medium"|"Low",summary:string,decision:string,goals:[{id:string,label:string,note:string,difficulty:"Easy"|"Moderate"|"Advanced",approvalStatus:string,approvalReason:string,approval:string,sourceIds:string[],reviewWait:string,reviewSourceIds:string[],reviewEstimate:string}],branches:[{name:string,time:string,detail:string}],requirements:[{title:string,detail:string,sourceIds:string[],goalIds:string[]}],steps:[{title:string,stage:"Prepare"|"Create"|"Configure"|"Test"|"Launch",where:{label:string,url:string},instructions:string[],values:[{label:string,value:string,hint:string}],verify:string,warning:string,blockers:[{problem:string,solution:string}],goalIds:string[],launchKind:"distribution"|"approval"|"",detail:string,owner:"Human"|"Agent"|"Human + agent",agentPrompt:string,humanPart:string,time:string,sourceIds:string[]}],blockers:[{problem:string,solution:string,goalIds:string[]}],agentCan:string[],humanMust:string[],unknowns:string[],sources:[{id:string,title:string,url:string,status:string}]}.
Write like a sharp dev on X: short, punchy, plain words, no filler. Step titles under 7 words. Max 3 instructions per step, each under 14 words. verify is one short sentence. Use 2-4 prerequisites, 4-8 actionable steps, 2-5 blockers, 2-8 official sources, 1-5 unknowns. Stages organize the checklist; multiple steps per stage are allowed and irrelevant stages can be omitted. Put testing before launch. Each step starts with an action verb and provides an exact dashboard location, direct link, short numbered actions as an array, fields/values when needed, a concrete success check, and source IDs. Code and example values must label placeholders. Never invent credentials. Keep one-sentence descriptions concise. Everything is per use case: each goal has its own difficulty, approvalStatus, approvalReason, and reviewEstimate, and every step's goalIds say which paths include it (setup time is the sum of that path's step times, so give every step a time). Ask only one goal question when audience or distribution changes the path. List first the goal where the developer's own users connect to the integration: 2-3 goals with stable IDs and explicit approval details. Otherwise goals is []. goalIds:[] means always applicable. Use goalIds on steps and prerequisites to hide optional review from users who do not need it. Distinguish distribution steps from approval steps with launchKind. Do not imply an access token proves public distribution or provider approval. Approval status needs supporting source IDs. difficulty is always Easy, Moderate, or Advanced, and provider approvalStatus is binary: Required or Not Required, never Conditional or Unknown. When it depends on the use case, add goals so each path resolves to one of the two, and set the top level to Required if any path needs review. Customer-side admin consent is not provider approval. approvalReason (top level and per goal, when Required) names in 1-2 words why or when, e.g. "Sensitive scopes", "Marketplace review", "Marketplace only", "Public launch". setupTime and reviewWait must be Unknown unless an official source actually documents the duration; cite it in their source ID fields. ALWAYS estimate time, never Unknown: give ONE exact number, never a range: effort such as "2 h", every step's time such as "20 min", and reviewEstimate (top level and per goal) such as "4 days" or "3 weeks", or "none" when no review applies. These are shown as estimates; base them on official docs when available, otherwise on typical developer experience. agentCan lists concrete work an AI coding agent can do; humanMust lists where the developer must take over (sign-in, terms, secrets, submissions). Set each step's owner accordingly. For every step whose owner is Agent or Human + agent, write agentPrompt: a concrete instruction a developer pastes into a coding agent such as Claude Code or Cursor (what to build or check, real endpoint URLs, env var names, tests to add; never real secrets). For Human + agent steps, humanPart is one short line on what only the developer can do (sign in, approve, paste secrets into env). Separate an initial review response from final approval. Retain detail as a short legacy summary of each step. Unknown fields use Unknown or empty arrays, never fabricated precision.`;

const SYSTEM = `You are an expert OAuth provider-integration researcher and launch readiness analyst. The user is building an AI agent and wants users to connect the named provider (bring-your-own OAuth app). Investigate CURRENT FIRST-PARTY OFFICIAL provider developer documentation using web search. Research: registration, OAuth/PKCE and redirects, scope constraints, public/third-party installation, separate marketplace listing, review prerequisites, security and privacy requirements, fees and approval time only if published, hidden constraints and blocker handling. Distinguish provider-controlled approval from customer workspace-admin approval. Distinguish development, unlisted distribution, production, and marketplace; do not claim marketplace listing is needed just for using OAuth without evidence. Prefer official sources; if only secondary source exists, label it. Every time claim needs a first-party source. Keep setupTime and reviewWait Unknown unless documented, but always fill effort, step time, and reviewEstimate with your best estimate. Agent cannot log in as a developer or accept terms, register with external provider, obtain secrets, submit forms or approvals; be explicit. Do NOT generate or solicit credentials. Cite sources in JSON fields. Identify what is tested vs inferred: research is documentation-only; no real provider console sign-in or submission was performed. Avoid hallucination and return unknown when necessary. ${SCHEMA}`;

export function slugify(s) { const base = s.toLowerCase().replace(/^https?:\/\//,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,46); return base || 'integration'; }
export function validInput(text) { return typeof text === 'string' && !validateQuery(text); }
export function safeUrl(input) { try { const u = new URL(input); return u.protocol === 'https:' && !u.username && !u.password && !(/^(localhost|\d+\.\d+\.\d+\.\d+|.*\.local|.*\.internal)$/i.test(u.hostname)); } catch { return false; } }
export function normalizeGuide(raw, query) {
  if (!raw || typeof raw !== 'object' || !raw.name || !Array.isArray(raw.steps) || raw.steps.length < 1) throw new Error('Research did not produce a usable guide');
  const clean = s => typeof s === 'string' ? s.slice(0,2400).trim() : '';
  const arr = (v, max=12) => Array.isArray(v) ? v.filter(x=>x!=null).slice(0,max) : [];
  const sources = arr(raw.sources,10).map((s,i)=>({id:clean(s.id)||`s${i+1}`,title:clean(s.title)||'Research source',url:clean(s.url),status:'Found by research agent · link not independently checked'})).filter(s=>safeUrl(s.url));
  const ids = new Set(sources.map(s=>s.id));
  const citations = v=>arr(v,8).filter(x=>typeof x==='string' && ids.has(x));
  // Provider approval is binary; citations are still kept separately as evidence.
  const status = value => value === 'Not Required' ? 'Not Required' : 'Required';
  const goals = arr(raw.goals,3).filter(x=>clean(x.id)&&clean(x.label)).map(x=>({id:clean(x.id).slice(0,60),label:clean(x.label),note:clean(x.note),difficulty:['Easy','Moderate','Advanced'].includes(x.difficulty)?x.difficulty:'',approvalStatus:status(x.approvalStatus,x.sourceIds),approvalReason:clean(x.approvalReason).split(/\s+/).slice(0,2).join(' '),approval:clean(x.approval),sourceIds:citations(x.sourceIds),reviewWait:citations(x.reviewSourceIds).length?clean(x.reviewWait)||'Unknown':'Unknown',reviewSourceIds:citations(x.reviewSourceIds),reviewEstimate:clean(x.reviewEstimate).slice(0,40)}));
  const goalIds = value => arr(value,3).filter(id=>goals.some(goal=>goal.id===id));
  const blockers = values => arr(values,7).map(x=>({problem:clean(x.problem),solution:clean(x.solution),goalIds:goalIds(x.goalIds)}));
  const guide = {
    slug:`${slugify(clean(raw.name)||query)}-${createHash('sha1').update(query.toLowerCase().trim()).digest('hex').slice(0,6)}`,
    name:clean(raw.name)||query,category:clean(raw.category)||'Integration',website:safeUrl(raw.website)?raw.website:'',icon:(clean(raw.name)||query).slice(0,2).toUpperCase(),tone:'#245b48',
    aliases:arr(raw.aliases,5).map(clean).map(s=>s.toLowerCase()),description:clean(raw.description),
    difficulty:['Easy','Moderate','Advanced'].includes(raw.difficulty)?raw.difficulty:'',approvalReason:clean(raw.approvalReason).split(/\s+/).slice(0,2).join(' '),
    effort:clean(raw.effort)||'Unknown',setupTime:citations(raw.setupTimeSourceIds).length?clean(raw.setupTime)||'Unknown':'Unknown',setupTimeSourceIds:citations(raw.setupTimeSourceIds),
    approval:clean(raw.approval)||'Unknown',approvalStatus:status(raw.approvalStatus,raw.approvalSourceIds),approvalSourceIds:citations(raw.approvalSourceIds),
    reviewWait:citations(raw.reviewSourceIds).length?clean(raw.reviewWait)||'Unknown':'Unknown',reviewSourceIds:citations(raw.reviewSourceIds),reviewEstimate:clean(raw.reviewEstimate).slice(0,40),
    confidence:['High','Medium','Low'].includes(raw.confidence)?raw.confidence:'Low',
    type:'Agent research · docs only',updated:new Date().toISOString().slice(0,10),
    summary:clean(raw.summary),decision:clean(raw.decision),goals,
    branches:arr(raw.branches,5).map(x=>({name:clean(x.name),time:clean(x.time),detail:clean(x.detail)})),
    requirements:arr(raw.requirements,8).map(x=>({title:clean(x.title),detail:clean(x.detail),sourceIds:citations(x.sourceIds),goalIds:goalIds(x.goalIds)})),
    steps:arr(raw.steps,16).map(x=>({title:clean(x.title),detail:clean(x.detail),stage:STAGES.includes(x.stage)?x.stage:'',where:{label:clean(x.where?.label),url:safeUrl(x.where?.url)?x.where.url:''},instructions:arr(x.instructions,10).map(clean).filter(Boolean),values:arr(x.values,10).map(v=>({label:clean(v.label),value:clean(v.value),hint:clean(v.hint)})),verify:clean(x.verify),warning:clean(x.warning),blockers:blockers(x.blockers),goalIds:goalIds(x.goalIds),launchKind:['distribution','approval'].includes(x.launchKind)?x.launchKind:'',owner:['Human','Agent','Human + agent'].includes(x.owner)?x.owner:'Human + agent',agentPrompt:clean(x.agentPrompt).slice(0,1200),humanPart:clean(x.humanPart).slice(0,300),time:clean(x.time),sourceIds:citations(x.sourceIds)})),
    blockers:blockers(raw.blockers),
    agentCan:arr(raw.agentCan,6).map(clean),humanMust:arr(raw.humanMust,6).map(clean),unknowns:[...arr(raw.unknowns,6).map(clean),'Documentation investigation only; no authenticated provider setup or approval was attempted by this app.'],sources
  };
  if (!guide.sources.length) {guide.unknowns.unshift('No valid source URLs were returned. All provider-specific claims require independent verification.');guide.confidence='Low';}
  if (!guide.steps.some(x=>x.sourceIds.length)) guide.confidence='Low';
  return guide;
}

function parseModelJson(s) {
  const stripped = s.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try { return JSON.parse(stripped); } catch {}
  const a = stripped.indexOf('{'), b = stripped.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(stripped.slice(a,b+1));
  throw new Error('The researcher returned invalid JSON');
}

export async function research(query, notify, useCase="") {
  if (!process.env.OPENAI_API_KEY) throw new Error('Live research requires OPENAI_API_KEY in the server environment. The curated guides remain fully usable without it.');
  notify('Investigating provider documentation with web search');
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(),110000);
  let response;
  try {
    const r = await fetch(process.env.OPENAI_RESPONSES_URL||'https://api.openai.com/v1/responses',{
      method:'POST', signal:controller.signal,
      headers:{'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:process.env.OPENAI_MODEL||'gpt-5-mini',
        tools:[{type:'web_search'}],
        instructions:SYSTEM,
        input:`Research OAuth developer app setup for: ${query}. Use case: ${useCase||"Not specified"}. Investigate the precise provider. Use at least two official links whenever available. Today's date: ${new Date().toISOString().slice(0,10)}. Return JSON only.`,
        max_output_tokens:10000
      })
    });
    response = await r.json();
    if(!r.ok) throw Error(`Research API ${r.status}: ${response?.error?.message||'request failed'}`);
  } finally {clearTimeout(timeout);}
  notify('Structuring a developer-ready launch plan');
  const output = response.output_text || (response.output||[]).filter(i=>i.type==='message').flatMap(i=>i.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('\n');
  const raw = parseModelJson(output||'');
  const guide = normalizeGuide(raw,query);
  notify('Checking citations and separating unknowns');
  await Promise.all(guide.sources.map(async src=>{
    // Checking link reachability is distinct from verifying that every claim is true.
    try {
      const ctl = new AbortController(); const t = setTimeout(()=>ctl.abort(),4500);
      try {
        const r=await fetch(src.url,{method:'HEAD',signal:ctl.signal,redirect:'manual',headers:{'user-agent':'Web2Guide-Research/1.0'}});
        src.status = (r.status>=200 && r.status<400) ? 'Link reachable · content not independently audited' : `Link status ${r.status} · content not independently audited`;
      } finally {clearTimeout(t);}
    } catch {src.status='Link not checked (blocked or timed out)';}
  }));
  return guide;
}
