import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildModel, usableW, portsFeasible, uplinkAvail, sizeOne, sizeAll } from '../src/sizer.js';
import { loadData } from '../scripts/lib.mjs';

/* A small, hand-built catalog so each rule can be pinned down exactly. */
function fixture() {
  const fam = (id, extra, models) => ({
    id, vendor: extra.vendor || 'Acme', family: id.toUpperCase(), role: extra.role,
    stacking: { tech: 'AcmeStack', maxMembers: 8, frontPanel: !!extra.fp, ...(extra.stacking || {}) },
    routing: { tier: extra.tier || 'full', bgp: extra.bgp ?? true },
    power: { redundancy: { supported: true, detail: 'x' } },
    lifecycle: extra.lifecycle, models
  });
  return {
    sources: { s: { title: 'Datasheet', url: 'https://example.com', retrieved: '2026-01-01' } },
    uplinks: {
      up4x10: { modular: false, options: [{ label: '4x 10G SFP+', ports: [{ count: 4, speedGbps: 10 }] }] },
      upmod: { modular: true, options: [{ label: 'NM-2Y: 2x 25G', ports: [{ count: 2, speedGbps: 25 }] }, { label: 'NM-8X: 8x 10G', ports: [{ count: 8, speedGbps: 10 }] }] }
    },
    families: [
      fam('a', {}, [
        { sku: 'A-24P', accessPorts: [{ count: 24, speedGbps: 1, poeWatts: 30 }], uplinks: 'up4x10',
          poeBudgets: [{ config: '1x 740W', watts: 740 }, { config: '1x 470W', watts: 470 }, { config: '1x 370W', watts: 370 }], switchingGbps: 128 },
        { sku: 'A-48P', accessPorts: [{ count: 48, speedGbps: 1, poeWatts: 30 }], uplinks: 'up4x10',
          poeBudgets: [{ config: '1x 1440W', watts: 1440 }], switchingGbps: 176 },
        { sku: 'A-24T', accessPorts: [{ count: 24, speedGbps: 1, poeWatts: 0 }], uplinks: 'up4x10', switchingGbps: 128 },
        { sku: 'A-MG', accessPorts: [{ count: 8, speedGbps: 5, poeWatts: 60 }, { count: 16, speedGbps: 1, poeWatts: 30 }], uplinks: 'upmod',
          poeBudgets: [{ config: '2000W', watts: 2000 }], switchingGbps: 200 },
        { sku: 'A-SFP', accessPorts: [{ count: 24, speedGbps: 10, poeWatts: 0, media: 'sfp' }], uplinks: 'up4x10', switchingGbps: 480 }
      ]),
      fam('eol', { lifecycle: { status: 'endOfSale', endOfSaleDate: '2025-01-01' } }, [
        { sku: 'OLD-24P', accessPorts: [{ count: 24, speedGbps: 1, poeWatts: 30 }], uplinks: 'up4x10', poeBudgets: [{ config: '370W', watts: 370 }], switchingGbps: 56 }
      ]),
      fam('l2', { tier: 'l2', bgp: false }, [
        { sku: 'L2-24P', accessPorts: [{ count: 24, speedGbps: 1, poeWatts: 30 }], uplinks: 'up4x10', poeBudgets: [{ config: '370W', watts: 370 }], switchingGbps: 56 }
      ]),
      fam('vsf', { fp: true, vendor: 'Vsfco' }, [
        { sku: 'V-24P', accessPorts: [{ count: 24, speedGbps: 1, poeWatts: 30 }], uplinks: 'up4x10', poeBudgets: [{ config: '740W', watts: 740 }], switchingGbps: 128 }
      ]),
      fam('agg', { role: 'aggregation' }, [
        { sku: 'AGG-48Y', accessPorts: [{ count: 48, speedGbps: 25, poeWatts: 0, media: 'sfp' }], switchingGbps: 4000 }
      ])
    ]
  };
}

const req = over => ({ groups: [], data: 0, fibN: 0, fibS: 10, upN: 0, upS: 10, ff: '', env: '', l3: 'l2', head: 0, stack: true, eos: false, vendors: new Set(), ...over });
const model = buildModel(fixture());
const sku = id => model.SKUS.find(s => s.sku === id);

describe('buildModel', () => {
  test('normalizes ports, budgets and defaults', () => {
    const s = sku('A-SFP');
    assert.deepEqual(s.ports, [[24, 10, 0, 'sfp']]);
    assert.equal(sku('A-24P').ports[0][3], 'rj45', 'media defaults to rj45');
    assert.equal(s.ff, '1RU', 'form factor defaults to 1RU');
    assert.deepEqual(sku('A-24P').lc, { status: 'current' }, 'no lifecycle means current');
    assert.equal(sku('OLD-24P').lc.status, 'endOfSale', 'models inherit the family lifecycle');
    assert.equal(model.upMod.upmod, true);
    assert.equal(model.FAM.agg.role, 'aggregation');
  });
});

describe('usableW', () => {
  test('caps a budget at what the ports can draw', () => {
    const s = sku('A-24P'); // 24 x 30 W = 720 W of port capacity
    assert.equal(usableW(s, ['x', 740]), 720);
    assert.equal(usableW(s, ['x', 370]), 370);
  });
});

describe('portsFeasible', () => {
  const s = sku('A-MG'); // 8x 5G/60W + 16x 1G/30W
  test('fast or high-power demand needs the matching ports', () => {
    assert.equal(portsFeasible(s, [{ qty: 8, w: 60, spd: 5, m: 'rj45' }], 1), true);
    assert.equal(portsFeasible(s, [{ qty: 9, w: 60, spd: 5, m: 'rj45' }], 1), false);
  });
  test('slow demand does not consume the scarce fast ports first', () => {
    const dem = [{ qty: 16, w: 30, spd: 1, m: 'rj45' }, { qty: 8, w: 60, spd: 5, m: 'rj45' }];
    assert.equal(portsFeasible(s, dem, 1), true);
  });
  test('scales with the number of switches', () => {
    assert.equal(portsFeasible(s, [{ qty: 16, w: 60, spd: 5, m: 'rj45' }], 2), true);
  });
  test('copper and fiber demand never share ports', () => {
    assert.equal(portsFeasible(s, [{ qty: 1, w: 0, spd: 1, m: 'sfp' }], 1), false);
  });
});

describe('uplinkAvail', () => {
  test('counts only uplinks at or above the requested speed, using the best option', () => {
    assert.equal(uplinkAvail(model, sku('A-MG'), req({ upS: 10 }), 1).per, 8);
    assert.equal(uplinkAvail(model, sku('A-MG'), req({ upS: 25 }), 1).per, 2);
    assert.equal(uplinkAvail(model, sku('A-24P'), req({ upS: 25 }), 1).per, 0);
  });
  test('front-panel stacking uses two uplinks per member', () => {
    const r = uplinkAvail(model, sku('V-24P'), req({ upS: 10, stack: true }), 3);
    assert.equal(r.vsf, 6);
    assert.equal(r.n, 12 - 6);
    assert.equal(uplinkAvail(model, sku('V-24P'), req({ upS: 10, stack: false }), 3).n, 12);
  });
});

describe('sizeOne', () => {
  test('one switch with the smallest supply that covers the load', () => {
    const r = sizeOne(model, sku('A-24P'), req({ groups: [{ qty: 10, w: 30, spd: 1 }] }));
    assert.equal(r.u, 1);
    assert.deepEqual(r.cfg, ['1x 370W', 370, 0]);
    assert.equal(r.W, 300);
  });
  test('sizes the supply for the busiest switch, not an even split', () => {
    // 31 devices at 30 W on 24-port switches: 2 switches, and the busiest carries 16 devices = 480 W.
    // An even split (465 W) would wrongly fit the 470 W supply.
    const r = sizeOne(model, sku('A-24P'), req({ groups: [{ qty: 31, w: 30, spd: 1 }] }));
    assert.equal(r.u, 2);
    assert.equal(r.perSw, 480);
    assert.equal(r.cfg[1], 740);
  });
  test('PoE headroom is applied to the load', () => {
    const r = sizeOne(model, sku('A-24P'), req({ groups: [{ qty: 12, w: 30, spd: 1 }], head: 10 }));
    assert.equal(Math.round(r.W), 396);
    assert.equal(r.cfg[1], 470, '396 W needs more than the 370 W supply');
  });
  test('out-of-scope models return null', () => {
    assert.equal(sizeOne(model, sku('AGG-48Y'), req({ data: 4 })), null, 'aggregation families never size');
    assert.equal(sizeOne(model, sku('A-24P'), req({ vendors: new Set(['Other']) })), null, 'vendor filter');
    assert.equal(sizeOne(model, sku('A-MG'), req({ ff: 'small' })), null, 'form factor filter');
  });
  test('each rejection names its reason', () => {
    const ap = { groups: [{ qty: 4, w: 30, spd: 1 }] };
    assert.equal(sizeOne(model, sku('OLD-24P'), req(ap)).rej, 'End of sale');
    assert.equal(sizeOne(model, sku('OLD-24P'), req({ ...ap, eos: true })).u, 1, 'allowed when end-of-sale is included');
    assert.match(sizeOne(model, sku('L2-24P'), req({ ...ap, l3: 'ospf' })).rej, /Layer 2 only/);
    assert.equal(sizeOne(model, sku('A-24P'), req({ fibN: 2 })).rej, 'No SFP access ports');
    assert.equal(sizeOne(model, sku('A-SFP'), req({ fibN: 2, fibS: 25 })).rej, 'No 25G SFP access ports');
    assert.equal(sizeOne(model, sku('A-24T'), req(ap)).rej, 'No ports deliver 30W');
    assert.equal(sizeOne(model, sku('A-24P'), req({ groups: [{ qty: 1, w: 60, spd: 1 }] })).rej, 'No ports deliver 60W');
    assert.equal(sizeOne(model, sku('A-24P'), req({ groups: [{ qty: 1, w: 30, spd: 5 }] })).rej, 'No 5G copper ports');
    assert.equal(sizeOne(model, sku('A-24P'), req({ upN: 1, upS: 25 })).rej, 'No 25G uplinks');
    assert.equal(sizeOne(model, sku('A-24P'), req({ data: 24 * 13 })).rej, 'Needs more than 12 switches');
    assert.equal(sizeOne(model, sku('A-SFP'), req({ fibN: 4, env: 'rugged' })).rej, 'Not built for rugged environments');
  });
  test('notes flag VSF uplink use and modular uplinks', () => {
    const v = sizeOne(model, sku('V-24P'), req({ data: 40, upN: 2, stack: true }));
    assert.equal(v.u, 2);
    assert.ok(v.notes.some(n => /VSF stacking uses 4 uplink ports/.test(n.t)));
    const m = sizeOne(model, sku('A-MG'), req({ upN: 2, upS: 25 }));
    assert.ok(m.notes.some(n => /Uplink module required: NM-2Y/.test(n.t)));
  });
});

describe('sizeAll', () => {
  test('ranks fewest switches first, then the smallest usable supply', () => {
    const { ok, rej } = sizeAll(model, req({ groups: [{ qty: 30, w: 30, spd: 1 }] }));
    const order = ok.map(r => `${r.s.sku}x${r.u}`);
    assert.equal(order[0], 'A-48Px1', 'one 48-port switch beats two 24-port switches');
    assert.ok(order.indexOf('A-48Px1') < order.indexOf('A-24Px2'));
    assert.ok(rej['End of sale'].includes('OLD-24P'));
    assert.ok(!ok.some(r => r.s.sku === 'AGG-48Y'));
  });
});

describe('real catalog', () => {
  const real = buildModel(loadData());
  const request = req({ groups: [{ qty: 12, w: 45, spd: 5 }, { qty: 40, w: 7, spd: 1 }], upN: 2, upS: 10 });
  const { ok, rej } = sizeAll(real, request);
  test('the default closet has fits and ruled-out models', () => {
    assert.ok(ok.length > 0);
    assert.ok(Object.keys(rej).length > 0);
  });
  test('every fit actually meets the request', () => {
    const dem = request.groups.map(g => ({ qty: g.qty, w: g.w, spd: g.spd, m: 'rj45' }));
    for (const r of ok) {
      assert.ok(portsFeasible(r.s, dem, r.u), `${r.s.sku}: ports`);
      assert.ok(r.up.n >= request.upN, `${r.s.sku}: uplinks`);
      assert.ok(usableW(r.s, r.cfg) >= r.perSw, `${r.s.sku}: PoE supply covers the busiest switch`);
      assert.notEqual(real.FAM[r.s.fam].role, 'aggregation', `${r.s.sku}: aggregation excluded`);
      assert.equal(r.s.lc.status, 'current', `${r.s.sku}: end-of-sale excluded by default`);
    }
  });
  test('results are sorted by switch count', () => {
    for (let i = 1; i < ok.length; i++) assert.ok(ok[i - 1].u <= ok[i].u);
  });
});
