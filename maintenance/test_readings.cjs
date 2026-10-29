const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const dataPath = path.join(root, 'docs/assets/readings-v17.json');
const catalogue = JSON.parse(fs.readFileSync(dataPath));
const sources = JSON.parse(fs.readFileSync(path.join(root, 'maintenance/reading-sources.json')));
let count = 0;
const test = async (name, run) => { await run(); console.log('PASS', name); count++; };
(async () => {
  const reader = await import('../docs/assets/readings-v17.js');
  await test('All six readings have full text and individual source credits', () => {
    assert.equal(catalogue.books.length, 6);
    assert.equal(new Set(catalogue.books.map(b => b.id)).size, 6);
    for (const book of catalogue.books) {
      assert.ok(book.translator && book.license && new URL(book.sourceUrl).protocol === 'https:');
      assert.ok(book.sections.length);
      for (const section of book.sections) {
        assert.ok(section.paragraphs.length);
        assert.equal(new Set(section.paragraphs.map(p => p.ref)).size, section.paragraphs.length);
        for (const paragraph of section.paragraphs) assert.ok(paragraph.text.trim() && !/<[^>]+>/.test(paragraph.text));
      }
    }
  });
  await test('Dhammapada contains each of the 423 verses once, in 26 chapters', () => {
    const book = catalogue.books.find(b => b.id === 'dhammapada');
    assert.equal(book.sections.length, 26);
    const refs = book.sections.flatMap(s => s.paragraphs.map(p => p.ref));
    assert.deepEqual(refs, Array.from({length: 423}, (_, i) => 'dhp' + (i + 1)));
  });
  await test('SuttaCentral source snapshots match their upstream Git blob SHAs', () => {
    for (const source of Object.values(sources)) {
      const body = Buffer.from(source.content);
      const sha = crypto.createHash('sha1').update('blob ' + body.length + '\0').update(body).digest('hex');
      assert.equal(sha, source.sha);
    }
  });
  await test('Every translated source segment survives in the reading catalogue', () => {
    const clean = text => text.replace(/<[^>]*>/g, '').trim();
    const body = catalogue.books.flatMap(b => b.sections.flatMap(s => s.paragraphs.map(p => p.text))).join('\n');
    for (const [filename, source] of Object.entries(sources)) {
      if (!filename.endsWith('.json')) continue;
      for (const [ref, value] of Object.entries(JSON.parse(source.content))) {
        if (ref.split(':')[1].startsWith('0.') || !clean(value)) continue;
        assert.ok(body.includes(clean(value)), 'Missing ' + ref);
      }
    }
  });
  await test('Catalogue regeneration is deterministic', () => {
    const before = fs.readFileSync(dataPath);
    cp.execFileSync('python3', [path.join(root, 'maintenance/build_readings.py')]);
    assert.deepEqual(fs.readFileSync(dataPath), before);
  });
  await test('Corrupt or unavailable storage does not prevent reading', () => {
    const expected = {size:20, theme:'paper', places:{}};
    assert.deepEqual(reader.readState({getItem(){throw Error('disabled')}}), expected);
    assert.deepEqual(reader.readState({getItem(){return '{broken'}}), expected);
    assert.equal(reader.writeState({setItem(){throw Error('full')}}, expected), false);
  });
  await test('Reading place and preferences round-trip within safe limits', () => {
    let stored;
    const storage = {setItem(key, value){assert.equal(key, reader.STORAGE_KEY); stored=value;}, getItem(){return stored;}};
    const state = reader.normalizeState({size:99,theme:'night',places:{dhammapada:{chapter:999,ratio:4},metta:{chapter:0,ratio:0.42}}});
    assert.equal(state.size, 30); assert.deepEqual(state.places.dhammapada, {chapter:25,ratio:1});
    assert.ok(reader.writeState(storage,state)); assert.deepEqual(reader.readState(storage),state);
  });
  await test('Reader, catalogue and styles are bundled for offline use', () => {
    const inventory = JSON.parse(fs.readFileSync(path.join(root,'docs/offline-assets.json')));
    for (const ext of ['js','json','css']) assert.ok(inventory.includes('./assets/readings-v17.'+ext));
    const page = fs.readFileSync(path.join(root,'docs/assets/page-UposathaV16.js'),'utf8');
    assert.ok(page.includes('(0,Z.jsx)(UposathaReadings,{react:A})'));
    assert.ok(page.includes('[`readings`,`Read`]'));
  });
  console.log(`${count} reading checks passed`);
})().catch(error => {console.error(error); process.exit(1);});
