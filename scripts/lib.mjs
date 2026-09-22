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
    accessories: (index.accessories || []).map(p => {
      const a = read(p);
      a.id = p.replace(/^accessories\//, '').replace(/\.json$/, '');
      return a;
    }),
  };
}

const SPEEDS = [1, 2.5, 5, 10, 25];
const MEDIA = ['rj45', 'sfp'];
const FABRIC_SPEEDS = [40, 50, 100, 200, 400];
const FABRIC_MEDIA = ['sfp', 'qsfp', 'qsfp-dd'];
const FORMS = ['1RU', 'Compact', 'Desktop'];
const TIERS = ['l2', 'ospf', 'full'];
const ROLES = ['access', 'aggregation'];
const STATUSES = ['current', 'endOfSale', 'endOfSupport'];
const MOUNTS = ['rack', 'desktop', 'wall', 'din'];
const ACC_CATS = ['transceiver', 'dac', 'aoc', 'stacking'];
const ACC_SPEEDS = [1, 10, 20, 25, 40, 50, 100, 120, 400];
const ACC_FORMS = ['SFP', 'SFP+', 'SFP28', 'SFP56', 'QSFP+', 'QSFP28', 'QSFP56', 'QSFP-DD', 'SFP-DD', 'StackWise-480', 'StackWise-160', 'Stack', 'Kit'];
const ACC_REACH = ['SR', 'LR', 'LRM', 'ER', 'SX', 'LX', 'LX/LH', 'LH', 'LX40', 'FX', 'T', 'SR4', 'LR4', 'USR', 'ZR', 'BiDi', 'CWDM'];
const ACC_MEDIA = ['MMF', 'SMF', 'Copper', 'DAC', 'AOC', 'Stack', 'Kit'];
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export function validate(data, today = new Date().toISOString().slice(0, 10)) {
  const errors = [], warnings = [];
  const skus = new Set(), ids = new Set();
  const replacements = [];

  /* Lifecycle and rugged fields are allowed on a family (as a default) and on a model (overriding it). */
  const checkLifecycle = (at, lc) => {
    if (!lc) return;
    if (!STATUSES.includes(lc.status)) errors.push(`${at}: lifecycle.status must be one of ${STATUSES.join(', ')}`);
    for (const k of ['endOfSaleDate', 'endOfSupportDate'])
      if (lc[k] !== undefined && !isDate(lc[k])) errors.push(`${at}: lifecycle.${k} must be a YYYY-MM-DD date`);
    if (lc.status !== 'current' && !lc.endOfSaleDate) errors.push(`${at}: lifecycle.status ${lc.status} needs endOfSaleDate`);
    if (lc.status === 'current' && isDate(lc.endOfSaleDate || '') && lc.endOfSaleDate < today)
      warnings.push(`${at}: lifecycle.status is current but endOfSaleDate ${lc.endOfSaleDate} has passed`);
    for (const r of lc.replacement || []) replacements.push([at, r]);
  };
  const checkRugged = (at, o) => {
    if (o.operatingTempC && !(o.operatingTempC.min < o.operatingTempC.max))
      errors.push(`${at}: operatingTempC.min must be less than max`);
    for (const m of o.mounting || [])
      if (!MOUNTS.includes(m)) errors.push(`${at}: mounting "${m}" must be one of ${MOUNTS.join(', ')}`);
  };
  for (const [k, src] of Object.entries(data.sources))
    if (src.language && src.language !== 'en') warnings.push(`source ${k}: not in English (${src.language}); add an English primary source and flag values that only appear here`);
  for (const f of data.families) {
    const at = `family ${f.id}`;
    if (ids.has(f.id)) errors.push(`${at}: duplicate family id`);
    ids.add(f.id);
    for (const k of ['vendor', 'family', 'source', 'routeScale', 'macTable', 'licensing'])
      if (!f[k]) errors.push(`${at}: missing ${k}`);
    if (!data.sources[f.source]) errors.push(`${at}: unknown source "${f.source}"`);
    for (const k of f.additionalSources || [])
      if (!data.sources[k]) errors.push(`${at}: unknown additionalSources entry "${k}"`);
    if (!TIERS.includes(f.routing?.tier)) errors.push(`${at}: routing.tier must be one of ${TIERS.join(', ')}`);
    if (f.role !== undefined && !ROLES.includes(f.role)) errors.push(`${at}: role must be one of ${ROLES.join(', ')}`);
    if (f.stacking?.maxMembers !== null && !(f.stacking?.maxMembers > 0)) errors.push(`${at}: stacking.maxMembers must be a number or null`);
    if (!f.models?.length) errors.push(`${at}: no models`);
    if ((f.verify || []).length && !f.verifyNote) warnings.push(`${at}: flagged for verification without a verifyNote`);
    checkLifecycle(at, f.lifecycle);
    checkRugged(at, f);
    const badRed = r => typeof r?.supported !== 'boolean' || !r?.detail;
    if (badRed(f.power?.redundancy)) errors.push(`${at}: power.redundancy needs supported (true/false) and detail`);
    for (const m of f.models || []) {
      const mt = `${m.sku} (${f.id})`;
      if (skus.has(m.sku)) errors.push(`${mt}: duplicate SKU`);
      skus.add(m.sku);
      if (m.source && !data.sources[m.source]) errors.push(`${mt}: unknown source "${m.source}"`);
      if (m.uplinks !== undefined && m.uplinks !== null) {
        if (!data.uplinks[m.uplinks]) errors.push(`${mt}: unknown uplink key "${m.uplinks}"`);
      }
      const access = m.accessPorts || [];
      const fabric = m.fabricPorts || [];
      if (!access.length && !fabric.length) errors.push(`model ${m.sku}: needs at least one port (accessPorts or fabricPorts)`);
      let cap = 0;
      for (const p of access) {
        if (!(p.count > 0)) errors.push(`${mt}: port group count must be > 0`);
        if (!SPEEDS.includes(p.speedGbps)) errors.push(`${mt}: speedGbps ${p.speedGbps} not in ${SPEEDS.join('/')}`);
        if (!(p.poeWatts >= 0)) errors.push(`${mt}: poeWatts must be >= 0`);
        if (p.media && !MEDIA.includes(p.media)) errors.push(`${mt}: media must be ${MEDIA.join(' or ')}`);
        if (p.media === 'sfp' && p.poeWatts > 0) errors.push(`${mt}: SFP ports cannot carry PoE`);
        cap += p.count * p.poeWatts;
      }
      for (const p of fabric) {
        if (!(p.count >= 1)) errors.push(`${mt}: fabricPorts count must be >= 1`);
        if (!FABRIC_SPEEDS.includes(p.speedGbps)) errors.push(`${mt}: fabricPorts speedGbps ${p.speedGbps} not in ${FABRIC_SPEEDS.join('/')}`);
        const media = p.media === undefined ? 'qsfp' : p.media;
        if (!FABRIC_MEDIA.includes(media)) errors.push(`${mt}: fabricPorts media must be one of ${FABRIC_MEDIA.join(', ')}`);
      }
      const hasPoe = cap > 0, hasBudget = (m.poeBudgets || []).length > 0;
      if (hasPoe && !hasBudget) errors.push(`${mt}: PoE ports but no poeBudgets`);
      if (!hasPoe && hasBudget) errors.push(`${mt}: poeBudgets but no PoE ports`);
      for (const b of m.poeBudgets || []) {
        if (!b.config || !(b.watts > 0)) errors.push(`${mt}: each poeBudget needs config and watts > 0`);
        if (b.watts > cap) warnings.push(`${mt}: "${b.config}" ${b.watts}W exceeds port capacity ${cap}W (ports x per-port max); the sizer uses ${cap}W`);
      }
      if (m.switchingGbps === null) warnings.push(`${mt}: switchingGbps not published (null)`);
      else if (!(m.switchingGbps > 0)) errors.push(`${mt}: switchingGbps missing`);
      if (m.redundancy && badRed(m.redundancy)) errors.push(`${mt}: redundancy needs supported (true/false) and detail`);
      if (m.formFactor && !FORMS.includes(m.formFactor)) errors.push(`${mt}: formFactor must be one of ${FORMS.join(', ')}`);
      const flagged = (m.verify || []).length || (m.poeBudgets || []).some(b => b.verify);
      if (flagged && !m.verifyNote) warnings.push(`${mt}: flagged for verification without a verifyNote`);
      checkLifecycle(mt, m.lifecycle);
      checkRugged(mt, m);
    }
  }
  for (const [at, r] of replacements)
    if (!skus.has(r) && !ids.has(r)) warnings.push(`${at}: lifecycle.replacement "${r}" is not a SKU or family id in the dataset`);

  const accIds = new Set();
  let accParts = 0;
  for (const a of data.accessories || []) {
    const at = `accessories ${a.id || a.vendor || '?'}`;
    if (!a.vendor) errors.push(`${at}: missing vendor`);
    if (!a.id) errors.push(`${at}: missing id`);
    else if (accIds.has(a.id)) errors.push(`${at}: duplicate accessories id`);
    else accIds.add(a.id);
    if (!a.source) errors.push(`${at}: missing source`);
    else if (!data.sources[a.source]) errors.push(`${at}: unknown source "${a.source}"`);
    if (!a.opticsMatrixUrl) errors.push(`${at}: missing opticsMatrixUrl`);
    if (!a.parts?.length) errors.push(`${at}: no parts`);
    const partKeys = new Set();
    for (const p of a.parts || []) {
      const pt = `${at} ${p.sku || '(no sku)'}`;
      if (!p.sku) errors.push(`${pt}: missing sku`);
      else {
        const key = p.sku + '\0' + (p.category || '');
        if (partKeys.has(key)) errors.push(`${pt}: duplicate SKU+category in this vendor file`);
        else partKeys.add(key);
      }
      if (!ACC_CATS.includes(p.category)) errors.push(`${pt}: category must be one of ${ACC_CATS.join(', ')}`);
      if (p.speedGbps !== null && !ACC_SPEEDS.includes(p.speedGbps))
        errors.push(`${pt}: speedGbps must be null or one of ${ACC_SPEEDS.join('/')}`);
      if (!ACC_FORMS.includes(p.formFactor)) errors.push(`${pt}: formFactor must be one of ${ACC_FORMS.join(', ')}`);
      if (!ACC_MEDIA.includes(p.media)) errors.push(`${pt}: media must be one of ${ACC_MEDIA.join(', ')}`);
      if (!(typeof p.distanceM === 'number') || p.distanceM < 0) errors.push(`${pt}: distanceM must be a number >= 0`);
      if (p.verified !== undefined && typeof p.verified !== 'boolean') errors.push(`${pt}: verified must be true or false`);
      if (p.category === 'transceiver') {
        if (!p.reach) errors.push(`${pt}: transceiver needs reach`);
        else if (!ACC_REACH.includes(p.reach)) errors.push(`${pt}: reach must be one of ${ACC_REACH.join(', ')}`);
      } else if (p.reach !== undefined && p.reach !== null && !ACC_REACH.includes(p.reach)) {
        errors.push(`${pt}: reach must be one of ${ACC_REACH.join(', ')}`);
      }
      accParts++;
    }
  }

  return { errors, warnings, families: data.families.length, models: skus.size, accessories: (data.accessories || []).length, accessoryParts: accParts };
}
