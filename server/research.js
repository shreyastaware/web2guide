import { createHash } from 'node:crypto';

const SCHEMA = `Return exactly ONE valid JSON object, nothing else, with these keys:
{name:string,category:string,website:string,difficulty:"Easy"|"Moderate"|"Hard"|"Depends on scopes"|"Uncertain",effort:string,approval:string,confidence:"High"|"Medium"|"Low",summary:string,decision:string,branches:[{name:string,time:string,detail:string}],requirements:[{title:string,detail:string,sourceIds:string[]}],steps:[{title:string,detail:string,owner:"Human"|"Agent"|"Human + agent",time:string,sourceIds:string[]}],blockers:[{problem:string,solution:string}],agentCan:string[],humanMust:string[],unknowns:string[],sources:[{id:string,title:string,url:string,status:string}]}. All keys required. 2-4 branches, 3-6 requirements, 4-7 steps, 2-4 blockers, 2-4 agentCan, 2-4 humanMust, 1-5 unknowns, 2-6 sources. Cite sources by id in every step and requirement where possible. If unverified, state 'Unknown' rather than estimating an SLA.`;

const SYSTEM = `You are an expert OAuth provider-integration researcher and launch readiness analyst. The user is building an AI agent and wants users to connect the named provider (bring-your-own OAuth app). Investigate CURRENT FIRST-PARTY OFFICIAL provider developer documentation using web search. Research: registration, OAuth/PKCE and redirects, scope constraints, public/third-party installation, separate marketplace listing, review prerequisites, security and privacy requirements, fees and approval time only if published, hidden constraints and blocker handling. Distinguish provider-controlled approval from customer workspace-admin approval. Distinguish development, unlisted distribution, production, and marketplace; do not claim marketplace listing is needed just for using OAuth without evidence. Prefer official sources; if only secondary source exists, label it. Every time claim must be tagged as official published vs estimated engineer effort, or unknown. Agent cannot log in as a developer or accept terms, register with external provider, obtain secrets, submit forms or approvals; be explicit. Do NOT generate or solicit credentials. Cite sources in JSON fields. Identify what is tested vs inferred: research is documentation-only; no real provider console sign-in or submission was performed. Avoid hallucination and return unknown when necessary. ${SCHEMA}`;

export function slugify(s) { const base = s.toLowerCase().replace(/^https?:\/\//,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,46); return base || 'integration'; }
export function validInput(text) { return typeof text === 'string' && text.trim().length >= 2 && text.trim().length <= 140 && !/[<>\n\r]/.test(text); }
export function safeUrl(input) { try { const u = new URL(input); return u.protocol === 'https:' && !u.username && !u.password && !(/^(localhost|\d+\.\d+\.\d+\.\d+|.*\.local|.*\.internal)$/i.test(u.hostname)); } catch { return false; } }
export function normalizeGuide(raw, query) {
  if (!raw || typeof raw !== 'object' || !raw.name || !Array.isArray(raw.steps) || raw.steps.length < 1) throw new Error('Research did not produce a usable guide');
  const clean = s => typeof s === 'string' ? s.slice(0,2400).trim() : '';
  const arr = (v, max=12) => Array.isArray(v) ? v.slice(0,max) : [];
  const sources = arr(raw.sources,10).map((s,i)=>({id:clean(s.id)||`s${i+1}`,title:clean(s.title)||'Research source',url:clean(s.url),status:'Found by research agent · link not independently checked'})).filter(s=>safeUrl(s.url));
  const ids = new Set(sources.map(s=>s.id));
  const citations = v=>arr(v,8).filter(x=>typeof x==='string' && ids.has(x));
  const guide = {
    slug:`${slugify(clean(raw.name)||query)}-${createHash('sha1').update(query.toLowerCase().trim()).digest('hex').slice(0,6)}`,
    name:clean(raw.name)||query,category:clean(raw.category)||'Integration',website:safeUrl(raw.website)?raw.website:'',icon:(clean(raw.name)||query).slice(0,2).toUpperCase(),tone:'#655cda',
    difficulty:['Easy','Moderate','Hard','Depends on scopes','Uncertain'].includes(raw.difficulty)?raw.difficulty:'Uncertain',
    effort:clean(raw.effort)||'Unknown',approval:clean(raw.approval)||'Unknown',confidence:['High','Medium','Low'].includes(raw.confidence)?raw.confidence:'Low',
    type:'Agent research · docs only',updated:new Date().toISOString().slice(0,10),
    summary:clean(raw.summary),decision:clean(raw.decision),
    branches:arr(raw.branches,5).map(x=>({name:clean(x.name),time:clean(x.time),detail:clean(x.detail)})),
    requirements:arr(raw.requirements,8).map(x=>({title:clean(x.title),detail:clean(x.detail),sourceIds:citations(x.sourceIds)})),
    steps:arr(raw.steps,9).map(x=>({title:clean(x.title),detail:clean(x.detail),owner:['Human','Agent','Human + agent'].includes(x.owner)?x.owner:'Human + agent',time:clean(x.time),sourceIds:citations(x.sourceIds)})),
    blockers:arr(raw.blockers,7).map(x=>({problem:clean(x.problem),solution:clean(x.solution)})),
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
        max_output_tokens:6500
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
        const r=await fetch(src.url,{method:'HEAD',signal:ctl.signal,redirect:'manual',headers:{'user-agent':'AuthPath-Research/1.0'}});
        src.status = (r.status>=200 && r.status<400) ? 'Link reachable · content not independently audited' : `Link status ${r.status} · content not independently audited`;
      } finally {clearTimeout(t);}
    } catch {src.status='Link not checked (blocked or timed out)';}
  }));
  return guide;
}
