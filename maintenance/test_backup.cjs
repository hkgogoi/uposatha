// Exercise the exact backup functions used by the shipped settings UI.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const page = fs.readFileSync(path.join(__dirname, '../docs/assets/page-UposathaV16.js'), 'utf8');
const KEY = 'uposatha-readings-v1';
const PRACTICE = 'uposatha-practice-v1';
const stamp = '2026-10-30T12:00:00.000Z';
const clone = value => JSON.parse(JSON.stringify(value));
class Storage {
  constructor(data = {}) { this.data = new Map(Object.entries(data)); this.failKey = null; this.failAlways = false; }
  get length() { return this.data.size; }
  key(i) { return [...this.data.keys()][i] ?? null; }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) {
    if (key === this.failKey) { if (!this.failAlways) this.failKey = null; throw Error('Quota exceeded'); }
    this.data.set(key, value);
  }
  removeItem(key) { this.data.delete(key); }
  snapshot() { return Object.fromEntries(this.data); }
}
const practice = {version:1, haptics:true,
  days:{'2026-10-29':{status:'observed',reflection:'A quiet day.',tradition:'theravada',updatedAt:stamp}},
  sessions:[{id:'meditation-1',date:'2026-10-29',kind:'meditation',amount:1200,label:'Evening',completedAt:stamp}],
  counters:{metta:{count:108,target:108,label:'Loving kindness'}}};
const legacy = {
  [PRACTICE]:JSON.stringify(practice), 'uposatha-tradition':'theravada',
  'uposatha-preferences':JSON.stringify({tradition:'theravada',timezone:'Asia/Kolkata',hour:8,customDates:'2026-11-09',active:true}),
  'uposatha-volume':'0.4', 'uposatha-repeat-chants':'true', 'uposatha-community-chant-tradition':'tibetan',
  'uposatha-japanese-settings':JSON.stringify({school:'zen',schedule:'monthly',dates:'',monthDays:'1,15'}),
  'uposatha-check-2026-10-29':'[0,2,4]'
};
const defaults = {size:20,theme:'paper',places:{}};
const fullReading = {size:26,theme:'night',places:{dhammapada:{chapter:18,ratio:0.625},
  'heart-sutra':{chapter:0,ratio:1},metta:{chapter:0,ratio:0.25},blessings:{chapter:0,ratio:0},
  'first-teaching':{chapter:0,ratio:0.75},'eight-precepts':{chapter:0,ratio:0.5}}};
const backup = data => ({format:'uposatha-device-backup',version:1,createdAt:stamp,data});
let count = 0;
function test(name, run) { run(); count++; console.log('PASS', name); }
(async () => {
  const reader = await import('../docs/assets/readings-v17.js');
  // Put helpers in the VM realm so the production plain-object checks are exercised.
  const readerSource = fs.readFileSync(path.join(__dirname, '../docs/assets/readings-v17.js'),'utf8')
    .split('export function ReadingLibrary')[0].replace(/export /g, '');
  const context = vm.createContext({TextEncoder, console});
  vm.runInContext(readerSource + '\n' +
    page.slice(page.indexOf('var ar='), page.indexOf('function fr(')) +
    page.slice(page.indexOf('var Tr='), page.indexOf('function Lr(')) +
    'function Rr(){};' +
    page.slice(page.indexOf('var oi='), page.indexOf('function yi(')) +
    '\nglobalThis.api={validate:fi,parse:pi,create:gi,restore:vi,summary:_i,Recovery:oi};', context);
  const object = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context);
  const api = context.api;
  test('Version 1 backups restore every existing practice and calendar setting', () => {
    const storage = new Storage({'other-app':'private'});
    api.restore(object(backup(legacy)), storage);
    assert.deepEqual(storage.snapshot(), {...legacy,'other-app':'private'});
  });
  test('New backup includes reader defaults even before the first reading', () => {
    const exported = clone(api.create(new Storage(legacy)));
    assert.deepEqual(JSON.parse(exported.data[KEY]), defaults);
  });
  test('Complete reading and practice state survives export, JSON parse, restore and re-export', () => {
    const data = {...legacy,[KEY]:JSON.stringify(fullReading)};
    const exported = api.create(new Storage(data));
    const imported = api.parse(JSON.stringify(exported));
    const target = new Storage({'sibling-project':'untouched'});
    api.restore(imported, target);
    assert.deepEqual(clone(reader.readState(target)), fullReading);
    for (const [key,value] of Object.entries(data)) assert.equal(target.getItem(key),value);
    assert.deepEqual(clone(api.create(target)).data,data);
    assert.equal(target.getItem('sibling-project'),'untouched');
  });
  test('Old backup without reader data preserves an existing reading place', () => {
    const storage = new Storage({...legacy,[KEY]:JSON.stringify(fullReading)});
    api.restore(object(backup(legacy)), storage);
    assert.deepEqual(reader.readState(storage),fullReading);
  });
  test('Old backup on a fresh device leaves safe reader defaults', () => {
    const storage = new Storage(); api.restore(object(backup(legacy)),storage);
    assert.equal(storage.getItem(KEY),null); assert.deepEqual(reader.readState(storage),defaults);
  });
  test('Missing reader fields recover defaults while retaining valid places', () => {
    const value = api.validate(object(backup({...legacy,[KEY]:JSON.stringify({places:{metta:{chapter:0}}})})));
    assert.deepEqual(JSON.parse(value.data[KEY]),{...defaults,places:{metta:{chapter:0,ratio:0}}});
  });
  test('Invalid scalar values are bounded or defaulted without numeric-string coercion', () => {
    for (const [input,expected] of [[{size:99,theme:'red'}, {size:30,theme:'paper',places:{}}],
      [{size:-1,theme:'night'}, {size:16,theme:'night',places:{}}],
      [{size:'24',theme:true}, defaults]]) {
      const result = api.validate(object(backup({...legacy,[KEY]:JSON.stringify(input)})));
      assert.deepEqual(JSON.parse(result.data[KEY]),expected);
    }
  });
  test('Chapter bounds match each text and scroll ratios stay between zero and one', () => {
    const result = reader.normalizeState({places:{dhammapada:{chapter:99,ratio:9},metta:{chapter:25,ratio:-2}}});
    assert.deepEqual(result.places,{dhammapada:{chapter:25,ratio:1},metta:{chapter:0,ratio:0}});
  });
  test('Unknown books, arrays, prototype keys and malformed place entries are discarded', () => {
    const raw = JSON.parse('{"places":{"__proto__":{"chapter":0},"unknown":{"chapter":0},"metta":[],"blessings":{"chapter":"1"},"first-teaching":{"chapter":0,"ratio":"0.5"}}}');
    assert.deepEqual(reader.normalizeState(raw).places,{'first-teaching':{chapter:0,ratio:0}});
    assert.deepEqual(reader.normalizeState({places:[]}),defaults);
    assert.deepEqual(reader.normalizeState({places:{metta:Object.assign([], {chapter:0})}}),defaults);
  });
  test('Malformed whole reader records never block practice restore or erase current reading state', () => {
    for (const raw of ['{broken','null','[]','42','"text"',42,null,' '.repeat(65537)]) {
      const storage = new Storage({[KEY]:JSON.stringify(fullReading)});
      api.restore(object(backup({...legacy,[KEY]:raw})),storage);
      assert.equal(storage.getItem(PRACTICE),legacy[PRACTICE]);
      assert.deepEqual(reader.readState(storage),fullReading);
    }
  });
  test('Empty reader object explicitly restores defaults', () => {
    const storage = new Storage({[KEY]:JSON.stringify(fullReading)});
    api.restore(object(backup({...legacy,[KEY]:'{}'})),storage);
    assert.deepEqual(reader.readState(storage),defaults);
  });
  test('Export excludes unrelated browser storage, install flags and unknown Uposatha keys', () => {
    const storage = new Storage({...legacy,[KEY]:JSON.stringify(fullReading),'auth-token':'secret',
      'uposatha-other-project':'private','uposatha-installed':'true','uposatha-check-2026-02-30':'[1]'});
    assert.deepEqual(Object.keys(api.create(storage).data).sort(),[...Object.keys(legacy),KEY].sort());
  });
  test('Restore rejects unrelated keys and invalid practice data before modifying storage', () => {
    const storage = new Storage(legacy); const before=storage.snapshot();
    for (const data of [{...legacy,'auth-token':'secret'},{...legacy,[PRACTICE]:'{}'}, {[KEY]:'{}'}])
      assert.throws(()=>api.restore(object(backup(data)),storage));
    assert.deepEqual(storage.snapshot(),before);
  });
  test('Storage failure rolls back reader data and every practice setting together', () => {
    const before = {...legacy,[KEY]:JSON.stringify(fullReading),'other':'private'};
    const storage = new Storage(before); storage.failKey=KEY;
    assert.throws(()=>api.restore(object(backup({...legacy,[KEY]:JSON.stringify(defaults)})),storage), /previous data has been restored unchanged/);
    assert.deepEqual(storage.snapshot(),before);
  });
  test('Unrecoverable storage failure provides the complete previous reader state for recovery', () => {
    const before = {...legacy,[KEY]:JSON.stringify(fullReading)};
    const storage = new Storage(before); storage.failKey=KEY; storage.failAlways=true;
    assert.throws(()=>api.restore(object(backup({...legacy,[KEY]:'{}'})),storage),error=>{
      assert.equal(error.name,'BackupRecoveryError'); assert.deepEqual(clone(error.recovery.data),before); return true;
    });
  });
  test('Corrupt local reading storage exports safe defaults and never includes unrelated data', () => {
    const storage = new Storage({...legacy,[KEY]:'{bad'});
    assert.deepEqual(JSON.parse(api.create(storage).data[KEY]),defaults);
  });
  test('Restoring is blocked during active meditation', () => {
    context.document={documentElement:{dataset:{meditating:'true'}}};
    const storage = new Storage(legacy);
    assert.throws(()=>api.restore(object(backup(legacy)),storage),/Pause your meditation/);
    assert.deepEqual(storage.snapshot(),legacy); delete context.document;
  });
  test('Unsupported backup versions and malformed JSON are rejected', () => {
    assert.throws(()=>api.parse('{broken'),/valid JSON/);
    assert.throws(()=>api.validate(object({...backup(legacy),version:99})),/supported Uposatha backup/);
    assert.throws(()=>api.parse(' '.repeat(5242881)),/smaller than 5 MB/);
  });
  console.log(`${count} backup checks passed`);
})().catch(error => {console.error(error);process.exit(1);});
