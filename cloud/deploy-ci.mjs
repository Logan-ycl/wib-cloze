import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {webcrypto as crypto} from 'node:crypto';
import assert from 'node:assert/strict';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error('Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to repository Actions secrets.');
async function cf(path,method='GET',body){
 const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const j=await r.json();if(!r.ok||!j.success)throw Error(`Cloudflare ${method} ${path}: HTTP ${r.status}; codes ${(j.errors||[]).map(e=>e.code).join(',')}`);return j.result;
}
let databases=await cf('/d1/database?name=brieflab-progress');
let db=databases.find(x=>x.name==='brieflab-progress');
if(!db)db=await cf('/d1/database','POST',{name:'brieflab-progress'});
const config=readFileSync('cloud/wrangler.toml.example','utf8').replace('REPLACE_WITH_YOUR_D1_DATABASE_ID',db.uuid);
writeFileSync('cloud/wrangler.toml',config);
await cf(`/d1/database/${db.uuid}/query`,'POST',{sql:readFileSync('cloud/schema.sql','utf8')});
execFileSync('npx',['--yes','wrangler@4','deploy','--config','cloud/wrangler.toml'],{stdio:'inherit'});
const sub=await cf('/workers/subdomain');
if(!sub.subdomain)throw Error('Cloudflare workers.dev subdomain must be configured in the account.');
await cf('/workers/scripts/brieflab-sync/subdomain','POST',{enabled:true});
const origin=`https://brieflab-sync.${sub.subdomain}.workers.dev`;
for(let attempt=0;;attempt++){
 try{const r=await fetch(origin+'/health');assert.equal(r.status,200);assert.equal((await r.json()).storage,true);break;}
 catch(e){if(attempt>=11)throw e;await new Promise(r=>setTimeout(r,5000));}
}
// Independent clients share only a randomly generated disposable test recovery key.
const key=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
const aes=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('brieflab-encryption-v1:'+key)),{name:'AES-GCM'},false,['encrypt','decrypt']);
async function client(method,body,secret=key){return fetch(origin+'/v1/state',{method,headers:{Origin:'https://logan-ycl.github.io',Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
try{
 assert.equal((await client('GET',null,'invalid')).status,401);
 const first=await (await client('GET')).json();assert.equal(first.revision,0);
 const plain=JSON.stringify({v:1,progress:{records:{ci_test:{wrongCount:1,history:[{attemptId:'ci',correct:false,answer:'test'}]}}}});
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},aes,new TextEncoder().encode(plain));
 const blob={v:1,iv:Buffer.from(iv).toString('base64url'),ct:Buffer.from(ct).toString('base64url'),zip:'none'};
 assert.equal((await client('PUT',{revision:0,blob})).status,200);
 const second=await (await client('GET')).json();assert.equal(second.revision,1);
 const restored=await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(second.blob.iv,'base64url')},aes,Buffer.from(second.blob.ct,'base64url'));
 assert.equal(new TextDecoder().decode(restored),plain);
 assert.equal((await client('PUT',{revision:0,blob})).status,409);
 assert.equal((await client('PUT',{revision:1,blob})).status,200);
 console.log('PASS: encrypted write/read, wrong-answer restoration, authentication and revision conflict checks.');
}finally{assert.equal((await client('DELETE')).status,200);}
writeFileSync('cloud-config.js',`window.BRIEFLAB_CLOUD_API=${JSON.stringify(origin)};\n`);
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`Worker: ${origin}\n\nAPI smoke checks passed. Physical-device browser testing remains separate.\n`);
