const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'docs/assets/page-UposathaV16.js'),'utf8');
const extracted=js.slice(js.indexOf('var gr='),js.indexOf('function br('));
const context=vm.createContext({Promise,Number});
vm.runInContext(extracted+';globalThis.Player=yr;globalThis.catalog=_r;',context);
class Audio {
 constructor(){this.paused=true;this.src='';this.volume=1;this.plays=0;this.loads=0;}
 pause(){this.paused=true;}
 load(){this.loads++;}
 play(){this.paused=false;this.plays++;return Promise.resolve();}
}
const make=(t='mahayana')=>{const a=new Audio(),m=new Audio();return {p:new context.Player(a,m,t,()=>{}),a,m};};
let checks=0;
async function test(name,fn){await fn();checks++;console.log('PASS',name);}
(async()=>{
 await test('Every playlist has unique identifiers and readable bundled media',()=>{
  for(const g of Object.values(context.catalog)){
   assert.equal(new Set(g.tracks.map(t=>t.id)).size,g.tracks.length);
   for(const t of g.tracks){assert.ok(fs.statSync(path.join(root,'docs',t.src)).size>10000);assert.ok(t.licenseUrl);}
  }
 });
 await test('Opening homage starts with instrumental music',async()=>{const {p,a,m}=make();await p.play();assert.equal(p.state.track.id,'namo');assert.equal(a.paused,false);assert.equal(m.paused,false);});
 await test('Opening advances to first chant and stops music',async()=>{const {p,m}=make();await p.play();p.next(true);await Promise.resolve();assert.equal(p.state.track.id,'compassion');assert.equal(m.paused,true);});
 await test('Direct selection while paused stays paused',()=>{const {p,a,m}=make();p.select('sitatapatra');assert.equal(p.state.track.id,'sitatapatra');assert.equal(p.state.playing,false);assert.equal(a.paused,true);assert.equal(m.paused,true);});
 await test('Direct selection while playing resumes selected recording',async()=>{const {p,m}=make();await p.play();p.select('heart-mandarin');await Promise.resolve();await Promise.resolve();assert.equal(p.state.track.id,'heart-mandarin');assert.equal(p.wanted,true);assert.equal(m.paused,true);});
 await test('Invalid track leaves current playback unchanged',async()=>{const {p,a}=make();await p.play();const s=a.src;p.select('not-a-track');assert.equal(a.src,s);assert.equal(p.state.playing,true);});
 await test('Changing tradition during homage waits for its end',()=>{const {p}=make();p.setTradition('theravada');assert.equal(p.state.track.id,'namo');p.next();assert.equal(p.state.track.id,'metta');});
 await test('Paused tradition change stays paused',()=>{const {p}=make();p.select('heart');p.setTradition('tibetan');assert.equal(p.state.track.id,'mani');assert.equal(p.state.playing,false);});
 await test('All tracks are reached in order without premature looping',()=>{for(const k of Object.keys(context.catalog)){const {p}=make(k);p.next();for(const t of context.catalog[k].tracks){assert.equal(p.state.track.id,t.id);p.next();}assert.equal(p.state.track.id,context.catalog[k].tracks[0].id);}});
 await test('Repeat off stops at last tradition track',async()=>{const {p}=make();p.select(context.catalog.mahayana.tracks.at(-1).id);p.setRepeat(false);await p.play();p.next(true);assert.equal(p.state.finished,true);assert.equal(p.state.playing,false);});
 await test('Repeat on loops tradition and never repeats opening automatically',async()=>{const {p}=make();p.select(context.catalog.mahayana.tracks.at(-1).id);await p.play();p.next(true);assert.equal(p.state.track.id,'compassion');assert.equal(p.state.opening,false);});
 await test('Selection after completion clears finished state',async()=>{const {p}=make();p.select(context.catalog.mahayana.tracks.at(-1).id);p.setRepeat(false);await p.play();p.next(true);p.select('guanyin');assert.equal(p.state.finished,false);assert.equal(p.state.track.id,'guanyin');assert.equal(p.state.playing,false);});
 await test('Explicit opening selection restores music only on Play',async()=>{const {p,m}=make();p.select('heart');p.select('namo');assert.equal(m.paused,true);await p.play();assert.equal(m.paused,false);});
 await test('Community opening-only stops normally',async()=>{const {p}=make(null);await p.play();p.next(true);assert.equal(p.state.finished,true);assert.equal(p.state.playing,false);});
 await test('Media failure can be recovered by selecting another chant',async()=>{const {p}=make();p.fail();p.select('guanyin');await p.play();assert.equal(p.state.notice,'');assert.equal(p.state.playing,true);});
 await test('Stale play promise cannot overwrite a newer selection',async()=>{const {p,a}=make();let done;a.play=()=>new Promise(r=>{done=r;});const old=p.play();p.pause();p.select('guanyin');done();await old;assert.equal(p.state.track.id,'guanyin');assert.equal(p.state.playing,false);});
 await test('Offline manifest includes all chant files and new bundles',()=>{const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/offline-assets.json')));for(const g of Object.values(context.catalog))for(const t of g.tracks)assert.ok(manifest.includes(t.src));for(const a of ['page-UposathaV16.js','index-UposathaV16.js','page-UposathaV16.css'])assert.ok(manifest.includes('./assets/'+a));});
 await test('Player renders each tradition selector and per-recording credits',()=>{
  const jsx=(type,props,key)=>({type,props,key});
  const renderContext=vm.createContext({Promise,Number,A:{useRef:()=>({current:null}),useState:x=>[x,()=>{}],useEffect:()=>{}},Z:{jsx,jsxs:jsx},b:'icon',T:'icon',k:'icon',x:'icon',S:'icon'});
  vm.runInContext(js.slice(js.indexOf('var gr='),js.indexOf('var xr='))+';globalThis.render=br;',renderContext);
  function walk(v,out=[]){if(v&&typeof v==='object'){out.push(v);if(v.props)walk(v.props.children,out);if(Array.isArray(v))v.forEach(x=>walk(x,out));}return out;}
  for(const tradition of ['mahayana','japanese','theravada','tibetan','custom']){
   const nodes=walk(renderContext.render({tradition}));
   const selector=nodes.find(n=>n.type==='label'&&n.props.className==='chant-choice chant-track-choice');
   const tracks=tradition==='custom'?[]:context.catalog[tradition].tracks;
   assert.equal(walk(selector).filter(n=>n.type==='option').length,tracks.length+1);
   assert.equal(nodes.filter(n=>n.type==='p'&&n.props.className==='chant-license').length,tracks.length+1);
  }
 });
 console.log(`${checks} playback/package checks passed`);
})().catch(e=>{console.error(e);process.exit(1)});
