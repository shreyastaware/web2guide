import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {research,validInput,queryHash} from './research.js';
import {guideSummary} from '../public/guide-model.js';
import {createStore} from './store.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// Vercel's filesystem is read-only except /tmp; there the store uses Blob instead (see store.js).
const dataDir=path.resolve(process.env.DATA_DIR||(process.env.VERCEL?'/tmp/web2guide':path.join(root,'data')));
const publicDir=path.join(root,'public');
const seeds=JSON.parse(fs.readFileSync(path.join(root,'data/guides.json'),'utf8'));
const store=createStore(dataDir);
const attempts=new Map();
const host=url=>{try{return new URL(url).hostname.replace(/^www\./,'')}catch{return ''}};
const send=(res,code,obj)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));};
function collect(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>1600){reject(Error('Payload too large'));req.destroy();}});req.on('end',()=>{try{resolve(JSON.parse(s||'{}'))}catch{reject(Error('Invalid JSON'))}});req.on('error',reject)});}
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
export const handler=async(req,res)=>{
 let url;try{url=new URL(req.url,'http://local')}catch{return send(res,400,{error:'Invalid URL'})}
 if(req.method==='GET'&&url.pathname==='/api/health')return send(res,200,{ok:true,guides:seeds.length+(await store.all()).length,researchEnabled:!!process.env.OPENAI_API_KEY});
 if(req.method==='GET'&&url.pathname==='/api/guides')return send(res,200,[...seeds,...await store.all()].map(guideSummary));
 if(req.method==='GET'&&url.pathname.startsWith('/api/guides/')){const slug=decodeURIComponent(url.pathname.slice(12));const g=seeds.find(x=>x.slug===slug)||await store.one(slug);return send(res,g?200:404,g?{...g,deletable:!seeds.includes(g)}:{error:'Guide not found'});}
 if(req.method==='DELETE'&&url.pathname.startsWith('/api/guides/')){
  const slug=decodeURIComponent(url.pathname.slice(12));
  if(seeds.some(x=>x.slug===slug))return send(res,403,{error:'Built-in guides can’t be deleted.'});
  return await store.remove(slug)?send(res,200,{ok:true}):send(res,404,{error:'Guide not found'});
 }
 if(req.method==='POST'&&url.pathname==='/api/research'){
  let data;try{data=await collect(req)}catch(e){return send(res,400,{error:e.message})}
  if(!validInput(data.query))return send(res,400,{error:'Enter an app name or website (2–140 characters).'});
  const ip=req.socket.remoteAddress||'local',now=Date.now(),recent=(attempts.get(ip)||[]).filter(x=>now-x<3600000);
  if(recent.length>=6)return send(res,429,{error:'Limit reached: six research requests per hour per IP.'});
  attempts.set(ip,[...recent,now]);
  res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
  const event=(name,obj)=>{if(!res.destroyed)res.write(`event: ${name}\ndata: ${JSON.stringify(obj)}\n\n`)};
  const keepalive=setInterval(()=>{if(!res.destroyed)res.write(': ping\n\n')},12000);
  try{
   event('step',{message:'Interpreting the requested provider'});
   const useCase=(typeof data.useCase==='string'&&data.useCase.length<=280&&!/[<>]/.test(data.useCase))?data.useCase.trim():'';
   // The model can name the same app differently on each run ("Asana" vs "Asana (OAuth 2.0)"), so match an
   // earlier guide by the query hash in its slug, then by website, rather than saving a second copy.
   const saved=await store.all(),hash=queryHash(data.query.trim());
   const previous=saved.find(g=>g.slug.endsWith('-'+hash));
   if(previous){event('complete',{slug:previous.slug});return;}
   const guide=await research(data.query.trim(),message=>event('step',{message}),useCase);
   const sameSite=host(guide.website)&&[...seeds,...saved].find(g=>host(g.website)===host(guide.website));
   if(sameSite){event('complete',{slug:sameSite.slug});return;}
   await store.save(guide);
   event('complete',{slug:guide.slug});
  }catch(e){console.error('Research error:',e.message);event('error',{error:String(e.message||e).slice(0,400)});}finally{clearInterval(keepalive);res.end()}
  return;
 }
 if(req.method!=='GET')return send(res,405,{error:'Method not allowed'});
 let pathname=url.pathname;
 if(!['/','/app.js','/guide-model.js','/style.css','/favicon.svg'].includes(pathname)){if(pathname.startsWith('/guides/')||pathname==='/research'||pathname==='/guides'||pathname==='/guides/')pathname='/';else return send(res,404,{error:'Not found'})}
 const file=path.join(publicDir,pathname==='/'?'index.html':pathname);
 fs.readFile(file,(err,buf)=>{if(err)return send(res,404,{error:'Not found'});res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':pathname==='/'?'no-cache':'public, max-age=300'});res.end(buf)});
};
export const serve=(req,res)=>handler(req,res).catch(e=>send(res,500,{error:e.message}));
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const port=Number(process.env.PORT||3001);
 http.createServer(serve).listen(port,'0.0.0.0',()=>console.log(`Web2Guide ready at http://localhost:${port}`));
}
