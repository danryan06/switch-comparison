import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', p), 'utf8'));

export function loadData() {
  const index = read('index.json');
  return {
    updated: index.updated,
    sources: read('sources.json'),
    uplinks: read('uplinks.json'),
    families: index.families.map(read),
  };
}

const SPEEDS = [1, 2.5, 5, 10, 25];
const MEDIA = ['rj45', 'sfp'];
const FORMS = ['1RU', 'Compact', 'Desktop'];
const TIERS = ['l2', 'ospf', 'full'];

export function validate(data) {
  const errors = [], warnings = [];
  const skus = new Set(), ids = new Set();
  for (const f of data.families) {
    const at = `family ${f.id}`;
    if (ids.has(f.id)) errors.push(`${at}: duplicate family id`);
    ids.add(f.id);
    for (const k of ['vendor', 'family', 'source', 'routeScale', 'macTable', 'licensing'])
      if (!f[k]) errors.push(`${at}: missing ${k}`);
    if (!data.sources[f.source]) errors.push(`${at}: unknown source "${f.source}"`);
    if (!TIERS.includes(f.routing?.tier)) errors.push(`${at}: routing.tier must be one of ${TIERS.join(', ')}`);
    if (f.stacking?.maxMembers !== null && !(f.stacking?.maxMembers > 0)) errors.push(`${at}: stacking.maxMembers must be a number or null`);
    if (!f.models?.length) errors.push(`${at}: no models`);
    for (const m of f.models || []) {
      const mt = `${m.sku} (${f.id})`;
      if (skus.has(m.sku)) errors.push(`${mt}: duplicate SKU`);
      skus.add(m.sku);
      if (m.source && !data.sources[m.source]) errors.push(`${mt}: unknown source "${m.source}"`);
      if (!data.uplinks[m.uplinks]) errors.push(`${mt}: unknown uplink key "${m.uplinks}"`);
      if (!m.accessPorts?.length) errors.push(`${mt}: no accessPorts`);
      let cap = 0;
      for (const p of m.accessPorts || []) {
        if (!(p.count > 0)) errors.push(`${mt}: port group count must be > 0`);
        if (!SPEEDS.includes(p.speedGbps)) errors.push(`${mt}: speedGbps ${p.speedGbps} not in ${SPEEDS.join('/')}`);
        if (!(p.poeWatts >= 0)) errors.push(`${mt}: poeWatts must be >= 0`);
        if (p.media && !MEDIA.includes(p.media)) errors.push(`${mt}: media must be ${MEDIA.join(' or ')}`);
        if (p.media === 'sfp' && p.poeWatts > 0) errors.push(`${mt}: SFP ports cannot carry PoE`);
        cap += p.count * p.poeWatts;
      }
      const hasPoe = cap > 0, hasBudget = (m.poeBudgets || []).length > 0;
      if (hasPoe && !hasBudget) errors.push(`${mt}: PoE ports but no poeBudgets`);
      if (!hasPoe && hasBudget) errors.push(`${mt}: poeBudgets but no PoE ports`);
      for (const b of m.poeBudgets || []) {
        if (!b.config || !(b.watts > 0)) errors.push(`${mt}: each poeBudget needs config and watts > 0`);
        if (b.watts > cap) warnings.push(`${mt}: "${b.config}" ${b.watts}W exceeds port capacity ${cap}W (ports x per-port max)`);
      }
      if (m.switchingGbps === null) warnings.push(`${mt}: switchingGbps not published (null)`);
      else if (!(m.switchingGbps > 0)) errors.push(`${mt}: switchingGbps missing`);
      if (m.formFactor && !FORMS.includes(m.formFactor)) errors.push(`${mt}: formFactor must be one of ${FORMS.join(', ')}`);
      const flagged = (m.verify || []).length || (m.poeBudgets || []).some(b => b.verify);
      if (flagged && !m.verifyNote) warnings.push(`${mt}: flagged for verification without a verifyNote`);
    }
  }
  return { errors, warnings, families: data.families.length, models: skus.size };
}
