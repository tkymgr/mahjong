import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function worker({fail=false,clients=1,vary=false}={}){
 const handlers={},stores=new Map(),scope='https://example.test/mahjong/',prefix='mahjong-pwa:/mahjong/:';
 const state={skipped:0,claimed:0,clients,network:0};
 const key=r=>{const u=new URL(typeof r==='string'?r:r.url);u.search='';return u.href;};
 const caches={keys:async()=>[...stores.keys()],delete:async name=>stores.delete(name),open:async name=>{
  if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);
  return {addAll:async requests=>{if(fail)throw Error('cache failed');for(const r of requests)store.set(key(r),`cached:${key(r)}`);},match:async (r,options)=>vary&&key(r).includes('/assets/')&&!options?.ignoreVary?undefined:store.get(key(r))};
 }};
 const self={registration:{scope,installing:null,waiting:null},clients:{matchAll:async()=>Array.from({length:state.clients},()=>({url:scope})),claim:async()=>{state.claimed++;}},skipWaiting:async()=>{state.skipped++;},addEventListener:(name,fn)=>{handlers[name]=fn;}};
 const source=readFileSync('scripts/pwa-sw.js','utf8').replace('__PWA_BUILD_ID__','"new"').replace('__PWA_ASSETS__','["index.html","assets/current.js"]');
 vm.runInNewContext(source,{self,caches,URL,Request,fetch:async()=>{state.network++;return 'network';}});
 return {state,self,stores,prefix,scope,handlers,async event(name,data={}){let task;handlers[name]({...data,waitUntil:p=>{task=p;}});await task;},async fetch(url,mode='cors',method='GET'){let task;handlers.fetch({request:{url,mode,method},respondWith:p=>{task=p;}});return task;}};
}

test('PWA precaches before activation and does not skip a running game automatically',async()=>{
 const w=worker();await w.event('install');
 assert.equal(w.stores.get(w.prefix+'new').size,2);assert.equal(w.state.skipped,0);
 await w.event('activate');assert.equal(w.state.claimed,1);assert.equal(w.state.skipped,0);
 await w.event('message',{data:{type:'ACTIVATE_UPDATE'}});assert.equal(w.state.skipped,1);
});

test('a failed cache installation removes only its incomplete snapshot',async()=>{
 const w=worker({fail:true});w.stores.set(w.prefix+'old',new Map());
 await assert.rejects(w.event('install'),/cache failed/);
 assert.equal(w.stores.has(w.prefix+'new'),false);assert.equal(w.stores.has(w.prefix+'old'),true);
});

test('cleanup preserves other apps, old tabs and a currently installing update',async()=>{
 const w=worker({clients:2});await w.event('install');
 w.stores.set(w.prefix+'old',new Map());w.stores.set('another-app',new Map());
 await w.event('message',{data:{type:'CLEANUP',buildId:'new'}});assert.equal(w.stores.has(w.prefix+'old'),true);
 w.state.clients=1;w.self.registration.installing={};
 await w.event('message',{data:{type:'CLEANUP',buildId:'new'}});assert.equal(w.stores.has(w.prefix+'old'),true);
 w.self.registration.installing=null;
 await w.event('message',{data:{type:'CLEANUP',buildId:'old'}});assert.equal(w.stores.has(w.prefix+'old'),true);
 await w.event('message',{data:{type:'CLEANUP',buildId:'new'}});assert.equal(w.stores.has(w.prefix+'old'),false);assert.equal(w.stores.has('another-app'),true);
});

test('offline navigation uses the current shell while old tabs can fetch their previous bundles',async()=>{
 const w=worker();await w.event('install');w.stores.set(w.prefix+'old',new Map([[w.scope+'assets/old.js','old-bundle']]));
 assert.equal(await w.fetch(w.scope,'navigate'),'cached:'+w.scope+'index.html');
 assert.equal(await w.fetch(w.scope+'assets/current.js?v=1'),'cached:'+w.scope+'assets/current.js');
 assert.equal(await w.fetch(w.scope+'assets/old.js'),'old-bundle');
 assert.equal(await w.fetch('https://other.test/file'),undefined);
 assert.equal(await w.fetch('https://example.test/another-app/file'),undefined);
 assert.equal(await w.fetch(w.scope+'action','cors','POST'),undefined);
 assert.equal(w.state.network,0);
});


test('precache matches static modules even when the server varies Origin headers',async()=>{
 const w=worker({vary:true});await w.event('install');
 assert.equal(await w.fetch(w.scope+'assets/current.js'),'cached:'+w.scope+'assets/current.js');
 assert.equal(w.state.network,0);
});
