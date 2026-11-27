import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, loadData, validate, validateAccessoryImages } from '../scripts/lib.mjs';

const fresh = () => {
  const d = loadData();
  d.schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/schema.json'), 'utf8'));
  return d;
};
const errorsOf = d => validate(d).errors;
const has = (list, re) => list.some(e => re.test(e));

describe('validate: the real data', () => {
  test('has no errors', () => {
    assert.deepEqual(errorsOf(fresh()), []);
  });
});

describe('validate: catches broken data', () => {
  const firstModel = d => d.families[0].models[0];
  test('duplicate SKU', () => {
    const d = fresh();
    d.families[1].models.push(structuredClone(firstModel(d)));
    assert.ok(has(errorsOf(d), /duplicate SKU/));
  });
  test('PoE on an SFP port', () => {
    const d = fresh();
    firstModel(d).accessPorts = [{ count: 4, speedGbps: 10, poeWatts: 30, media: 'sfp' }];
    assert.ok(has(errorsOf(d), /SFP ports cannot carry PoE/));
  });
  test('PoE ports without any PoE budget', () => {
    const d = fresh();
    const m = d.families.flatMap(f => f.models).find(x => (x.poeBudgets || []).length);
    m.poeBudgets = [];
    assert.ok(has(errorsOf(d), /PoE ports but no poeBudgets/));
  });
  test('unknown source', () => {
    const d = fresh();
    d.families[0].source = 'no-such-source';
    assert.ok(has(errorsOf(d), /unknown source "no-such-source"/));
  });
  test('access port speed outside the allowed set', () => {
    const d = fresh();
    firstModel(d).accessPorts[0].speedGbps = 3;
    assert.ok(has(errorsOf(d), /speedGbps 3 not in/));
  });
  test('accessory part with a bad category', () => {
    const d = fresh();
    d.accessories[0].parts[0].category = 'cable';
    assert.ok(has(errorsOf(d), /category must be one of/));
  });
  test('transceiver without a reach', () => {
    const d = fresh();
    const p = d.accessories.flatMap(a => a.parts).find(x => x.category === 'transceiver');
    delete p.reach;
    assert.ok(has(errorsOf(d), /transceiver needs reach/));
  });
  test('data date older than the newest source is a warning', () => {
    const d = fresh();
    d.updated = '2000-01-01';
    assert.ok(has(validate(d).warnings, /data\/index.json: updated \(2000-01-01\) is older/));
  });
});

describe('validateAccessoryImages', () => {
  const realFile = path.join(ROOT, 'data', 'accessory-images.json');
  const real = () => JSON.parse(fs.readFileSync(realFile, 'utf8'));
  const run = man => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acc-img-'));
    const f = path.join(dir, 'accessory-images.json');
    fs.writeFileSync(f, JSON.stringify(man));
    try { return validateAccessoryImages(loadData(), f); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  };

  test('the real manifest has no errors and covers every SKU', () => {
    const r = validateAccessoryImages(loadData());
    assert.deepEqual(r.errors, []);
    const skus = new Set(loadData().accessories.flatMap(a => a.parts.map(p => a.vendor + '\0' + p.sku)));
    assert.equal(r.counts.images + r.counts.missing, skus.size);
  });
  test('SKU that is not in the catalog', () => {
    const m = real(); m.images[0].sku = 'NOT-A-REAL-SKU';
    assert.ok(has(run(m).errors, /SKU "NOT-A-REAL-SKU" is not in/));
  });
  test('source on a non-vendor domain', () => {
    const m = real(); m.images[0].source_page_url = 'https://www.example-reseller.com/p/1';
    assert.ok(has(run(m).errors, /is not a vendor domain/));
  });
  test('source that is not https', () => {
    const m = real(); m.images[0].source_page_url = m.images[0].source_page_url.replace('https://', 'http://');
    assert.ok(has(run(m).errors, /must be https/));
  });
  test('catalog SKU missing from both lists', () => {
    const m = real(); const gone = m.missing.pop();
    assert.ok(has(run(m).errors, new RegExp(`${gone.sku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} is in neither images nor missing`)));
  });
  test('SKU listed twice', () => {
    const m = real(); m.missing.push(structuredClone(m.missing[0]));
    assert.ok(has(run(m).errors, /is already listed/));
  });
  test('image file that does not exist', () => {
    const m = real(); m.images[0].file = 'images/accessories/cisco/does-not-exist.jpg';
    assert.ok(has(run(m).errors, /does not exist/));
  });
  test('field the schema does not declare is a warning', () => {
    const m = real(); m.images[0].captoin_note = 'typo';
    assert.ok(has(run(m).warnings, /property "captoin_note" not declared/));
  });
});
