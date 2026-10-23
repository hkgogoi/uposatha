const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const site = path.resolve(__dirname, '../docs');
const worker = fs.readFileSync(path.join(site, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
const entry = fs.readFileSync(path.join(site, 'assets/index-UposathaV16.js'), 'utf8');
const page = fs.readFileSync(path.join(site, 'assets/page-UposathaV16.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'manifest.webmanifest')));
const inventory = JSON.parse(fs.readFileSync(path.join(site, 'offline-assets.json')));
let count = 0;
async function test(name, run) { await run(); count++; console.log('PASS', name); }

function runtime(scope) {
  const handlers = {}, stores = new Map(), requests = [];
  const state = {offline:false, skip:0, claimed:0, missing:null, badManifest:null, badShell:false};
  const toURL = x => typeof x === 'string' ? x : x.url;
  async function fetchLocal(input) {
    const url = new URL(toURL(input)); requests.push(url.href);
    if (state.offline) throw Error('Offline');
    if (!url.href.startsWith(scope)) return new Response('Wrong project', {status:404});
    let relative = decodeURIComponent(url.pathname.slice(new URL(scope).pathname.length)) || 'index.html';
    if (relative === state.missing) return new Response('Missing', {status:404});
    if (relative === 'offline-assets.json' && state.badManifest) return Response.json(state.badManifest);
    const file = path.join(site, relative);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response('Missing', {status:404});
    const body = relative.endsWith('.mp3') ? '0123456789abcdef' : fs.readFileSync(file);
    if (relative === 'index.html' && state.badShell) return new Response(html.replace('index-UposathaV16.js', 'missing.js'));
    return new Response(body, {headers:{'Content-Type': relative.endsWith('.mp3') ? 'audio/mpeg' : 'text/plain'}});
  }
  class Cache {
    data = new Map();
    async addAll(inputs) {
      const responses = await Promise.all(inputs.map(fetchLocal));
      if (responses.some(r => !r.ok)) throw Error('Incomplete assets');
      for (let i=0;i<inputs.length;i++) await this.put(inputs[i], responses[i]);
    }
    async put(input, response) { this.data.set(toURL(input), response.clone()); }
    async match(input) { return this.data.get(toURL(input))?.clone(); }
  }
  const caches = {
    async open(key) { if (!stores.has(key)) stores.set(key, new Cache()); return stores.get(key); },
    async keys() { return [...stores.keys()]; },
    async delete(key) { return stores.delete(key); }
  };
  const self = {registration:{scope}, addEventListener:(name,fn)=>handlers[name]=fn,
    skipWaiting:async()=>state.skip++, clients:{claim:async()=>state.claimed++}};
  const ctx = vm.createContext({URL, Request, Response, AbortController, setTimeout, clearTimeout, self, caches, fetch:fetchLocal});
  vm.runInContext(worker+'\n;globalThis.info={cache:CACHE,prefix:CACHE_PREFIX};',ctx);
  async function event(name, fields={}) {
    let promise, result;
    handlers[name]({...fields, waitUntil:p=>promise=p, respondWith:p=>result=p});
    await promise;
    return result;
  }
  const fetchEvent = (relative, options={}) => event('fetch', {request:{url:new URL(relative,scope).href,
    method:options.method||'GET', mode:options.mode||'cors', headers:new Headers(options.headers)}});
  const ready = async()=>{let status;await event('message',{data:{type:'CHECK_OFFLINE_READY'},ports:[{postMessage:x=>status=x}]});return status.ready;};
  return {state, stores, requests, caches, event, fetchEvent, ready, info:ctx.info};
}

(async()=>{
  await test('All shipped JavaScript parses without dependencies',()=>{
    for(const file of ['sw.js','assets/index-UposathaV16.js','assets/page-UposathaV16.js'])
      cp.execFileSync(process.execPath,['--check',path.join(site,file)],{stdio:'pipe'});
  });
  await test('HTML, media, preload and worker registration stay inside the project',()=>{
    assert.ok(!/(?:src|href)=["']\//.test(html));
    assert.ok(!/["'`]\/(?:audio|assets|buddha|meditation|namo|icon)/.test(page));
    assert.ok(!page.includes('url(/'));
    assert.ok(entry.includes('new URL("../", import.meta.url)'));
    assert.ok(entry.includes('getRegistration(__uposathaBase.href)'));
    assert.ok(entry.includes('scope:__uposathaBase.href'));
    assert.ok(entry.includes('pe=function(e){return new URL(e,__uposathaBase).href}'));
    for(const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) assert.ok(fs.existsSync(path.join(site,match[1])));
  });
  await test('Install identity and icon URLs resolve at root and project paths',()=>{
    for(const base of ['https://example.github.io/','https://example.github.io/uposatha/','https://example.github.io/Uposatha-app/']){
      const url = new URL('manifest.webmanifest',base);
      assert.equal(new URL(manifest.id,url).href,base);
      assert.equal(new URL(manifest.scope,url).href,base);
      assert.equal(new URL(manifest.start_url,url).href,base+'?launch=app');
      for(const icon of manifest.icons) assert.ok(new URL(icon.src,url).href.startsWith(base));
    }
  });
  await test('Offline list covers every audio and bundle exactly once',()=>{
    assert.equal(new Set(inventory).size,inventory.length);
    const expected = ['assets','audio'].flatMap(dir=>fs.readdirSync(path.join(site,dir)).map(name=>'./'+dir+'/'+name)).sort();
    assert.deepEqual(inventory,expected);
    assert.ok(fs.existsSync(path.join(site,'.nojekyll')));
  });
  for(const scope of ['https://example.github.io/','https://example.github.io/uposatha/']){
    const r=runtime(scope);
    await test('Complete offline install at '+new URL(scope).pathname,async()=>{
      await r.event('install');assert.equal(r.state.skip,1);assert.equal(await r.ready(),true);
      assert.ok(r.requests.every(url=>url.startsWith(scope)));
    });
    await test('Offline launch and lazy app resources at '+new URL(scope).pathname,async()=>{
      r.state.offline=true;
      assert.equal(await (await r.fetchEvent('?launch=app',{mode:'navigate'})).text(),html);
      assert.equal((await r.fetchEvent('assets/page-UposathaV16.js')).status,200);
      assert.deepEqual(await (await r.fetchEvent('offline-assets.json')).json(),inventory);
    });
    await test('Offline audio supports explicit, suffix, open and invalid ranges at '+new URL(scope).pathname,async()=>{
      for(const [range,status,expected] of [['bytes=2-5',206,'2345'],['bytes=-3',206,'def'],['bytes=12-',206,'cdef'],['bytes=99-',416,''],['bytes=-0',416,'']]){
        const result=await r.fetchEvent('namo-tassa.mp3',{headers:{Range:range}});
        assert.equal(result.status,status);assert.equal(await result.text(),expected);
      }
    });
    await test('Evicted audio clears the offline-ready indicator at '+new URL(scope).pathname,async()=>{
      (await r.caches.open(r.info.cache)).data.delete(new URL('namo-tassa.mp3',scope).href);
      assert.equal(await r.ready(),false);
    });
  }
  await test('Incomplete downloads never activate the replacement worker',async()=>{
    const r=runtime('https://example.github.io/uposatha/');r.state.missing='audio/tibetan-om-tare.mp3';
    await assert.rejects(r.event('install'));assert.equal(r.state.skip,0);assert.equal(await r.ready(),false);
  });
  await test('Mismatched deployment files never activate',async()=>{
    const r=runtime('https://example.github.io/uposatha/');r.state.badShell=true;
    await assert.rejects(r.event('install'));assert.equal(r.state.skip,0);
  });
  await test('Unsafe and duplicate offline entries are rejected',async()=>{
    for(const bad of [['/assets/test.js'],['./audio/../private.mp3'],['https://other.test/audio.mp3'],['./assets/a.js','./assets/a.js']]){
      const r=runtime('https://example.github.io/uposatha/');r.state.badManifest=bad;
      await assert.rejects(r.event('install'));assert.equal(r.state.skip,0);
    }
  });
  await test('Activation preserves other projects and removes only its old cache',async()=>{
    const r=runtime('https://example.github.io/uposatha/');await r.event('install');
    const old=r.info.prefix+'old';const other='uposatha-pages-%2Fother%2F-old';
    for(const key of [old,other,'unrelated-app','uposatha-local-v15-old']) await r.caches.open(key);
    await r.event('activate');
    assert.ok(!r.stores.has(old));assert.ok(r.stores.has(other));assert.ok(r.stores.has('unrelated-app'));assert.ok(r.stores.has('uposatha-local-v15-old'));
    assert.ok(r.stores.has(r.info.cache));assert.equal(r.state.claimed,1);
  });
  await test('Other origins, sibling projects, and non-GET requests are untouched',async()=>{
    const r=runtime('https://example.github.io/uposatha/');
    for(const target of ['https://other.test/file','/other/file','/uposatha-other/file'])assert.equal(await r.fetchEvent(target),undefined);
    assert.equal(await r.fetchEvent('index.html',{method:'POST'}),undefined);
  });
  console.log(`${count} GitHub Pages checks passed`);
})().catch(error=>{console.error(error);process.exit(1)});
