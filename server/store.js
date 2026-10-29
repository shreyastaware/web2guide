import fs from 'node:fs';
import path from 'node:path';

// Generated guides live in Vercel Blob when a store is linked (BLOB_READ_WRITE_TOKEN), so every function
// instance sees the same guides and they survive restarts. Without a token they live in a local JSON file.
export function createStore(dataDir){
 if(process.env.BLOB_READ_WRITE_TOKEN)return blobStore();
 fs.mkdirSync(dataDir,{recursive:true});
 const file=path.join(dataDir,'generated.json');
 let guides=[];
 try{guides=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(guides))guides=[];}catch{}
 return {
  all:async()=>guides,
  one:async slug=>guides.find(g=>g.slug===slug),
  save:async guide=>{
   const index=guides.findIndex(g=>g.slug===guide.slug);
   if(index>=0)guides[index]=guide;else guides.push(guide);
   write();
  },
  remove:async slug=>{
   const before=guides.length;
   guides=guides.filter(g=>g.slug!==slug);
   if(guides.length===before)return false;
   write();return true;
  },
 };
 function write(){const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(guides,null,2));fs.renameSync(tmp,file);}
}

function blobStore(){
 const sdk=import('@vercel/blob');
 const cache=new Map(); // pathname -> {etag, guide}; skips re-downloading guides that haven't changed
 const key=slug=>`guides/${slug}.json`;
 // The SDK's get() answers 403 from inside Vercel functions, so read the public URL that list()/head() return.
 // The etag query makes each version a distinct URL, so the CDN never serves an overwritten guide.
 async function read(blob){
  const hit=cache.get(blob.pathname);
  if(hit&&hit.etag===blob.etag)return hit.guide;
  // A just-saved blob can 404 for a few seconds while it reaches the CDN, so retry briefly.
  let response;
  for(let attempt=0;attempt<8;attempt++){
   response=await fetch(`${blob.url}?v=${encodeURIComponent(blob.etag)}`,{signal:AbortSignal.timeout(10000)});
   if(response.ok)break;
   await new Promise(r=>setTimeout(r,750));
  }
  if(!response.ok)throw Error(`Blob read failed: ${response.status}`);
  const guide=await response.json();
  cache.set(blob.pathname,{etag:blob.etag,guide});
  return guide;
 }
 return {
  async all(){
   const {list}=await sdk;
   const blobs=[];let cursor;
   do{const page=await list({prefix:'guides/',cursor});blobs.push(...page.blobs);cursor=page.hasMore?page.cursor:undefined;}while(cursor);
   blobs.sort((a,b)=>new Date(a.uploadedAt)-new Date(b.uploadedAt));
   const guides=await Promise.all(blobs.map(b=>read(b).catch(e=>{console.error(e.message);return null;})));
   return guides.filter(Boolean);
  },
  async one(slug){
   const {head,BlobNotFoundError}=await sdk;
   try{return await read(await head(key(slug)));}catch(e){if(e instanceof BlobNotFoundError)return null;throw e;}
  },
  async save(guide){
   const {put}=await sdk;
   await put(key(guide.slug),JSON.stringify(guide),{access:'public',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json'});
  },
  async remove(slug){
   const {head,del,BlobNotFoundError}=await sdk;
   let blob;
   try{blob=await head(key(slug));}catch(e){if(e instanceof BlobNotFoundError)return false;throw e;}
   await del(blob.url);cache.delete(blob.pathname);
   return true;
  },
 };
}
