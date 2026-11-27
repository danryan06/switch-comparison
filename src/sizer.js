/* Closet sizer and data model, shared by the app and the tests.

   This file is an ES module so test/ can import it. scripts/build.mjs inlines it
   into dist/index.html as a classic script, stripping the `export` keywords, so
   everything declared at the top level here becomes a global in the page.
   Keep it free of DOM access and UI state: callers pass the model and request in. */

/* ---------- data model ---------- */

/* Turns the raw data/ files into the compact shapes the app works with.
   Ports are [count, speedGbps, poeWatts, media]; PoE budgets are [config, watts, verify]. */
export function buildModel(DATA) {
  const SRC = {};
  for (const [k, s] of Object.entries(DATA.sources)) SRC[k] = { t: s.title, u: s.url };
  const U = {}, upMod = {};
  for (const [k, o] of Object.entries(DATA.uplinks)) {
    U[k] = o.options.map(x => ({ n: x.label, p: x.ports.map(p => [p.count, p.speedGbps]) }));
    upMod[k] = !!o.modular;
  }
  const FAM = {}, SKUS = [];
  for (const f of DATA.families) {
    FAM[f.id] = {
      v: f.vendor, vendorSlug: f.vendorSlug || "", name: f.family, role: f.role || "access",
      stack: { t: f.stacking.tech, bw: f.stacking.bandwidthGbps, max: f.stacking.maxMembers, fp: f.stacking.frontPanel, note: f.stacking.note },
      mlag: f.mlag || null, l3: f.routing.tier, l3t: f.routing.summary, bgp: f.routing.bgp, routes: f.routeScale, mac: f.macTable,
      macsec: f.macsec, buf: f.buffer, psuFru: f.power.psuFieldReplaceable, red: f.power.redundancy, fanFru: f.fansFieldReplaceable,
      power: f.power.summary, lic: f.licensing, src: f.source, xsrc: f.additionalSources || [], famVerify: f.verify || [],
      fnote: f.verifyNote || "", lim: !!f.modelingLimitation
    };
    for (const m of f.models) SKUS.push({
      fam: f.id, sku: m.sku,
      ports: (m.accessPorts || []).map(p => [p.count, p.speedGbps, p.poeWatts, p.media || "rj45"]),
      fabric: (m.fabricPorts || []).map(p => [p.count, p.speedGbps, p.media || "qsfp"]),
      up: m.uplinks || null,
      psu: (m.poeBudgets || []).map(b => [b.config, b.watts, b.verify ? 1 : 0]),
      sw: m.switchingGbps, fwd: m.forwardingMpps, name: m.description || "", note: m.note || "", ff: m.formFactor || "1RU",
      src: m.source || f.source, fanless: !!m.fanless, pd: m.poweredBy || "", routes: m.routeScale || "", mac: m.macTable || "",
      buf: m.buffer || "",
      verify: [...(m.modelingLimitation ? [] : m.verify || []), ...(f.modelingLimitation ? [] : f.verify || [])],
      own: m.verify || [], lim: !!m.modelingLimitation, red: m.redundancy || f.power.redundancy, vnote: m.verifyNote || "",
      lc: m.lifecycle || f.lifecycle || { status: "current" },
      rug: (m.ruggedized !== undefined ? m.ruggedized : f.ruggedized) || false,
      temp: m.operatingTempC || f.operatingTempC || null, ip: m.ipRating || f.ipRating || "", mount: m.mounting || f.mounting || []
    });
  }
  return { SRC, U, upMod, FAM, SKUS };
}

/* ---------- helpers used by the sizer ---------- */

export const spdLabel = g => g >= 1 ? g + "G" : g * 1000 + "M";
export const totalPorts = s => s.ports.reduce((a, p) => a + p[0], 0);
export const poeCap = s => s.ports.reduce((a, p) => a + p[0] * p[2], 0);
/* Vendors state what the supplies make available, which on some models exceeds what the ports can draw. Sizing uses the lower of the two. */
export const usableW = (s, b) => Math.min(b[1], poeCap(s));
export const isCur = s => s.lc.status === "current";
/* End of support implies end of sale, so the later milestone is the one worth showing. */
export const lcShort = s => s.lc.status === "endOfSupport" ? "End of support " + (s.lc.endOfSupportDate || s.lc.endOfSaleDate) : "End of sale " + s.lc.endOfSaleDate;

/* ---------- sizing ---------- */

/* Can u switches of model s serve every demand? Demands take the slowest, lowest-PoE port that
   satisfies them, fastest and most power-hungry demands first, so scarce ports are not wasted. */
export function portsFeasible(s, dem, u) {
  const inv = s.ports.map(p => ({ g: p[1], w: p[2], m: p[3], n: p[0] * u })).sort((a, b) => a.g - b.g || a.w - b.w);
  const ds = [...dem].sort((a, b) => b.spd - a.spd || b.w - a.w);
  for (const d of ds) {
    let need = d.qty;
    for (const t of inv) {
      if (need <= 0) break;
      if (t.m === d.m && t.g >= d.spd && t.w >= d.w) { const k = Math.min(t.n, need); t.n -= k; need -= k; }
    }
    if (need > 0) return false;
  }
  return true;
}

/* Uplinks at or above the requested speed across u switches, using the best uplink option.
   Front-panel stacking (Aruba VSF) uses two uplink ports per member. */
export function uplinkAvail(model, s, req, u) {
  if (!s.up) return { n: 0, opt: null, vsf: 0, per: 0 };
  let best = 0, opt = null;
  for (const o of model.U[s.up]) { const n = o.p.reduce((a, x) => a + (x[1] >= req.upS ? x[0] : 0), 0); if (n > best) { best = n; opt = o; } }
  let total = best * u, vsf = 0;
  if (model.FAM[s.fam].stack.fp && req.stack && u > 1) { vsf = 2 * u; total = Math.max(0, total - vsf); }
  return { n: total, opt, vsf, per: best };
}

/* Sizes one model against a request. Returns null when the model is out of scope,
   { rej: reason } when it cannot meet the request, or the fewest-switches plan:
   { s, u, cfg, W, perSw, up, notes, ports }.
   req: { groups:[{qty,w,spd,name}], data, fibN, fibS, upN, upS, ff, env, l3, head, stack, eos, vendors:Set } */
export function sizeOne(model, s, req) {
  const f = model.FAM[s.fam];
  if (req.vendors && req.vendors.size && !req.vendors.has(f.v)) return null;
  /* Aggregation and core families are not wiring-closet candidates, even when they carry
     a handful of low-speed ports. Pure fabric models have no accessPorts at all. */
  if (f.role === "aggregation") return null;
  if (!s.ports.length) return null;
  if (req.ff === "1RU" && s.ff !== "1RU") return null;
  if (req.ff === "small" && s.ff !== "Compact" && s.ff !== "Desktop") return null;
  if (!req.eos && !isCur(s)) return { rej: "End of sale" };
  if (req.env === "rugged" && !s.rug) return { rej: "Not built for rugged environments" };
  if (req.l3 !== "l2" && f.l3 === "l2") return { rej: "Layer 2 only (routing stays on the firewall or core)" };
  if (req.l3 === "bgp" && !f.bgp) return { rej: "No BGP or EVPN support" };
  const dem = [...req.groups.map(g => ({ qty: g.qty, w: g.w, spd: g.spd, m: "rj45", name: g.name }))];
  if (req.data > 0) dem.push({ qty: req.data, w: 0, spd: 1, m: "rj45", name: "data ports" });
  if (req.fibN > 0) dem.push({ qty: req.fibN, w: 0, spd: req.fibS, m: "sfp", name: "fiber ports" });
  for (const d of dem) {
    if (!s.ports.some(p => p[3] === d.m && p[1] >= d.spd && p[2] >= d.w)) {
      if (d.m === "sfp") return { rej: s.ports.some(p => p[3] === "sfp") ? `No ${spdLabel(d.spd)} SFP access ports` : "No SFP access ports" };
      if (!s.ports.some(p => p[3] === "rj45")) return { rej: "No copper access ports" };
      return { rej: d.w > Math.max(...s.ports.filter(p => p[3] === "rj45").map(p => p[2])) ? `No ports deliver ${d.w}W` : `No ${spdLabel(d.spd)} copper ports` };
    }
  }
  const W = req.groups.reduce((a, g) => a + g.qty * g.w, 0) * (1 + req.head / 100);
  if (W > 0 && !s.psu.length) return { rej: "No PoE" };
  if (req.upN > 0 && uplinkAvail(model, s, req, 1).per === 0) return { rej: `No ${spdLabel(req.upS)} uplinks` };
  const cfgs = [...s.psu].sort((a, b) => usableW(s, a) - usableW(s, b));
  for (let u = 1; u <= 12; u++) {
    if (!portsFeasible(s, dem, u)) continue;
    const up = uplinkAvail(model, s, req, u); if (up.n < req.upN) continue;
    /* Devices are whole: with u switches, some switch carries ceil(qty/u) of each group.
       Size the supply for that busiest switch, not for an even split of the total watts. */
    const perSw = req.groups.reduce((a, g) => a + Math.ceil(g.qty / u) * g.w, 0) * (1 + req.head / 100);
    let cfg = null; if (W > 0) { cfg = cfgs.find(c => usableW(s, c) >= perSw); if (!cfg) continue; }
    const notes = [];
    if (!isCur(s)) notes.push({ w: 1, t: lcShort(s) });
    if (req.stack && u > 1 && f.stack.max === null) notes.push({ t: `No hardware stack: managed as one fabric via ${f.stack.t}` });
    if (req.l3 !== "l2" && f.v === "Fortinet") notes.push({ t: "Routing needs Advanced Features license" });
    if (req.stack && u > 1 && f.stack.max === 1) notes.push({ w: 1, t: "Not stackable: managed as separate switches" });
    if (s.ff !== "1RU") notes.push({ t: s.ff + (s.fanless ? ", fanless" : "") });
    if (s.pd) notes.push({ t: "Can be PoE powered" });
    if (req.stack && f.stack.max !== null && f.stack.max > 1 && u > f.stack.max) notes.push({ w: 1, t: `Exceeds the ${f.stack.max}-member ${f.stack.t} limit` });
    if (up.vsf) notes.push({ w: 1, t: `VSF stacking uses ${up.vsf} uplink ports, leaving ${up.n}` });
    if (req.l3 === "bgp" && s.fam.startsWith("c") && s.fam !== "c9350") notes.push({ t: "BGP needs Network Advantage" });
    if (req.l3 === "ospf" && s.fam.startsWith("c9200")) notes.push({ t: "Full OSPF needs Network Advantage" });
    if (model.upMod[s.up] && req.upN > 0) notes.push({ t: "Uplink module required: " + up.opt.n.split(":")[0] + " (sold separately)" });
    if (s.note) notes.push({ t: s.note });
    return { s, u, cfg, W, perSw, up, notes, ports: totalPorts(s) * u };
  }
  return { rej: "Needs more than 12 switches" };
}

/* Sizes every model and ranks the fits: fewest switches, then smallest usable supply, then fewest ports,
   then highest switching capacity. Returns { ok, rej } where rej maps a reason to the SKUs it ruled out. */
export function sizeAll(model, req) {
  const ok = [], rej = {};
  for (const s of model.SKUS) {
    const r = sizeOne(model, s, req);
    if (!r) continue;
    if (r.rej) (rej[r.rej] = rej[r.rej] || []).push(s.sku); else ok.push(r);
  }
  ok.sort((a, b) => a.u - b.u || (a.cfg && b.cfg ? usableW(a.s, a.cfg) - usableW(b.s, b.cfg) : 0) || a.ports - b.ports || b.s.sw - a.s.sw);
  return { ok, rej };
}
