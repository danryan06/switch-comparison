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
    families: index.families.map(p => {
      const f = read(p);
      /* Path slug (e.g. cisco-nexus) so accessories resolve even when display vendor is shared (Cisco). */
      f.vendorSlug = p.split('/')[1] || '';
      return f;
    }),
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
const FORMS = ['1RU', '1.2RU', '2RU', 'Compact', 'Desktop'];
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
  const checkLimitation = (at, o, flagged) => {
    if (o.modelingLimitation === undefined) return;
    if (typeof o.modelingLimitation !== 'boolean') errors.push(`${at}: modelingLimitation must be true or false`);
    else if (o.modelingLimitation && !flagged) errors.push(`${at}: modelingLimitation is set but nothing is flagged`);
    else if (o.modelingLimitation && !o.verifyNote) errors.push(`${at}: modelingLimitation needs a verifyNote describing the limitation`);
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
    if (f.mlag !== undefined) {
      if (!f.mlag || typeof f.mlag !== 'object') errors.push(`${at}: mlag must be an object with tech and note`);
      else {
        if (!f.mlag.tech) errors.push(`${at}: mlag.tech is required when mlag is present`);
        if (!f.mlag.note) errors.push(`${at}: mlag.note is required when mlag is present`);
      }
    }
    if (!f.models?.length) errors.push(`${at}: no models`);
    if ((f.verify || []).length && !f.verifyNote) warnings.push(`${at}: flagged for verification without a verifyNote`);
    checkLimitation(at, f, (f.verify || []).length);
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
      checkLimitation(mt, m, flagged);
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
      if (p.appliesTo !== undefined) {
        if (!Array.isArray(p.appliesTo)) errors.push(`${pt}: appliesTo must be an array of family IDs`);
        else for (const fid of p.appliesTo) {
          if (typeof fid !== 'string' || !fid) errors.push(`${pt}: appliesTo entries must be non-empty strings`);
          else if (!ids.has(fid)) errors.push(`${pt}: appliesTo unknown family id "${fid}"`);
        }
      }
      if (p.category === 'transceiver') {
        if (!p.reach) errors.push(`${pt}: transceiver needs reach`);
        else if (!ACC_REACH.includes(p.reach)) errors.push(`${pt}: reach must be one of ${ACC_REACH.join(', ')}`);
      } else if (p.reach !== undefined && p.reach !== null && !ACC_REACH.includes(p.reach)) {
        errors.push(`${pt}: reach must be one of ${ACC_REACH.join(', ')}`);
      }
      accParts++;
    }
  }

  /* Housekeeping: sources and uplink sets nobody references, sources with no retrieval date,
     and properties that data/schema.json does not declare (a typo, or a field that needs documenting). */
  const usedSrc = new Set(), usedUp = new Set();
  for (const f of data.families) {
    usedSrc.add(f.source); (f.additionalSources || []).forEach(k => usedSrc.add(k));
    for (const m of f.models || []) { if (m.source) usedSrc.add(m.source); if (m.uplinks) usedUp.add(m.uplinks); }
  }
  for (const a of data.accessories || []) usedSrc.add(a.source);
  for (const [k, src] of Object.entries(data.sources)) {
    if (!usedSrc.has(k)) warnings.push(`source ${k}: not referenced by any family, model, or accessory catalog`);
    if (!src.retrieved) warnings.push(`source ${k}: no retrieved date`);
    else if (!isDate(src.retrieved)) errors.push(`source ${k}: retrieved must be a YYYY-MM-DD date`);
  }
  for (const k of Object.keys(data.uplinks)) if (!usedUp.has(k)) warnings.push(`uplinks ${k}: not referenced by any model`);
  if (data.schema) {
    const S = data.schema, props = d => new Set(Object.keys(d?.properties || {}));
    const famP = props(S), modP = props(S.$defs.model), accP = props(S.$defs.accessoryCatalog), partP = props(S.$defs.accessoryPart);
    const undeclared = new Map();
    const note = (where, o, allowed, extra = []) => { for (const k of Object.keys(o)) if (!allowed.has(k) && !extra.includes(k)) undeclared.set(`${where}.${k}`, (undeclared.get(`${where}.${k}`) || 0) + 1); };
    for (const f of data.families) { note('family', f, famP, ['vendorSlug']); for (const m of f.models || []) note('model', m, modP); }
    for (const a of data.accessories || []) { note('accessory catalog', a, accP, ['id']); for (const p of a.parts || []) note('accessory part', p, partP); }
    for (const [k, n] of undeclared) warnings.push(`${k}: property not declared in data/schema.json (${n} file${n > 1 ? 's' : ''})`);
  }

  return { errors, warnings, families: data.families.length, models: skus.size, accessories: (data.accessories || []).length, accessoryParts: accParts };
}

/* Accessory product images: data/accessory-images.json lists every catalog SKU once, either with a
   vendor-hosted image under src/assets/ or in "missing" with the reason. Kept out of loadData() so the
   manifest does not ship inside index.html. */
const IMG_TYPES = ['photo', 'drawing'];
const IMG_MAX_BYTES = 300 * 1024;
const hostOf = u => { try { return new URL(String(u).trim().split(/\s/)[0]).hostname.toLowerCase(); } catch { return null; } };
/* An allowed host also admits its siblings on the same vendor domain when it is the bare or www host
   (www.cisco.com admits tmgmatrix.cisco.com), but not when it is a shared platform host. */
function hostAllowed(host, allowed) {
  if (!host) return false;
  for (const a of allowed) {
    if (host === a) return true;
    const base = a.replace(/^www\./, '');
    if ((a.startsWith('www.') || a.split('.').length === 2) && (host === base || host.endsWith('.' + base))) return true;
  }
  return false;
}

export function validateAccessoryImages(data, file = path.join(ROOT, 'data', 'accessory-images.json')) {
  const errors = [], warnings = [];
  const counts = { images: 0, missing: 0, files: 0 };
  if (!fs.existsSync(file)) return { errors, warnings, counts, skipped: true };
  let man;
  try { man = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { errors.push(`accessory-images: not valid JSON (${e.message})`); return { errors, warnings, counts }; }
  const at = 'accessory-images';
  if (!isDate(man.retrieved || '')) errors.push(`${at}: retrieved must be a YYYY-MM-DD date`);
  if (!man.sourcing_rule) errors.push(`${at}: missing sourcing_rule`);
  if (!Array.isArray(man.images) || !Array.isArray(man.missing)) {
    errors.push(`${at}: images and missing must both be arrays`);
    return { errors, warnings, counts };
  }

  /* Catalog SKUs per vendor, and the domains each vendor's catalog and families cite. */
  const catalogs = new Map();
  const allowed = new Set();
  const vendorHosts = new Map();
  for (const a of data.accessories || []) {
    const hosts = new Set([hostOf(a.opticsMatrixUrl), hostOf(data.sources[a.source]?.url)].filter(Boolean));
    for (const f of data.families) if (f.vendorSlug === a.id)
      for (const k of [f.source, ...(f.additionalSources || []), ...(f.models || []).map(m => m.source)])
        if (k && data.sources[k]) hosts.add(hostOf(data.sources[k].url));
    catalogs.set(a.vendor, { id: a.id, skus: new Set((a.parts || []).map(p => p.sku)) });
    vendorHosts.set(a.vendor, hosts);
    hosts.forEach(h => h && allowed.add(h));
  }
  for (const s of Object.values(data.sources)) { const h = hostOf(s.url); if (h) allowed.add(h); }

  const seen = new Map();
  const mark = (where, vendor, sku) => {
    const key = vendor + '\0' + sku;
    if (seen.has(key)) errors.push(`${where}: ${vendor} ${sku} is already listed in ${seen.get(key)}`);
    else seen.set(key, where.split(' ')[1]);
  };
  const known = (where, e) => {
    const c = catalogs.get(e.vendor);
    if (!c) { errors.push(`${where}: unknown vendor "${e.vendor}" (must match an accessories catalog vendor exactly)`); return null; }
    if (!c.skus.has(e.sku)) errors.push(`${where}: SKU "${e.sku}" is not in the ${e.vendor} catalog`);
    return c;
  };

  const files = new Set();
  man.images.forEach((e, i) => {
    const where = `${at} images[${i}] ${e.vendor || '?'} ${e.sku || '?'}`;
    for (const k of ['vendor', 'sku', 'file', 'image_type', 'source_page_url', 'source_detail', 'retrieved'])
      if (!e[k]) errors.push(`${where}: missing ${k}`);
    const c = known(where, e);
    mark(`${at} images`, e.vendor, e.sku);
    if (e.image_type && !IMG_TYPES.includes(e.image_type)) errors.push(`${where}: image_type must be one of ${IMG_TYPES.join(', ')}`);
    if (e.retrieved && !isDate(e.retrieved)) errors.push(`${where}: retrieved must be a YYYY-MM-DD date`);
    if (e.file) {
      if (!/^images\/accessories\/[a-z0-9-]+\/[a-z0-9-]+\.(jpg|png)$/.test(e.file))
        errors.push(`${where}: file must look like images/accessories/<vendor-slug>/<sku-slug>.jpg (or .png)`);
      else if (c && !e.file.startsWith(`images/accessories/${c.id}/`))
        warnings.push(`${where}: file is stored under another vendor's folder (${e.file})`);
      const p = path.join(ROOT, 'src', 'assets', e.file);
      if (!fs.existsSync(p)) errors.push(`${where}: file src/assets/${e.file} does not exist`);
      else {
        const size = fs.statSync(p).size;
        if (size > IMG_MAX_BYTES) errors.push(`${where}: src/assets/${e.file} is ${Math.round(size / 1024)} KB (limit ${IMG_MAX_BYTES / 1024} KB)`);
        files.add(e.file);
      }
    }
    if (e.source_page_url) {
      const u = String(e.source_page_url);
      const h = hostOf(u);
      if (!u.startsWith('https://')) errors.push(`${where}: source_page_url must be https`);
      if (!hostAllowed(h, allowed)) errors.push(`${where}: source_page_url host "${h}" is not a vendor domain from data/sources.json or an opticsMatrixUrl`);
      else if (c && !hostAllowed(h, vendorHosts.get(e.vendor) || new Set())) warnings.push(`${where}: source_page_url host "${h}" is not one this vendor's catalog or families cite`);
    }
    counts.images++;
  });
  man.missing.forEach((e, i) => {
    const where = `${at} missing[${i}] ${e.vendor || '?'} ${e.sku || '?'}`;
    if (!e.vendor || !e.sku) errors.push(`${where}: missing vendor or sku`);
    if (!e.reason) errors.push(`${where}: missing reason`);
    known(where, e);
    mark(`${at} missing`, e.vendor, e.sku);
    counts.missing++;
  });
  for (const [vendor, c] of catalogs)
    for (const sku of c.skus)
      if (!seen.has(vendor + '\0' + sku)) errors.push(`${at}: ${vendor} ${sku} is in neither images nor missing`);

  /* Files on disk that no manifest entry points at. */
  const dir = path.join(ROOT, 'src', 'assets', 'images', 'accessories');
  if (fs.existsSync(dir))
    for (const v of fs.readdirSync(dir))
      for (const f of fs.readdirSync(path.join(dir, v))) {
        const rel = `images/accessories/${v}/${f}`;
        if (!files.has(rel)) warnings.push(`${at}: src/assets/${rel} is not referenced by any image entry`);
      }
  counts.files = files.size;
  return { errors, warnings, counts };
}
