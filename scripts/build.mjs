import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadData, validate, validateAccessoryImages, assembleHtml } from './lib.mjs';

const data = loadData();
const r = validate(data);
r.errors.push(...validateAccessoryImages(data).errors);
if (r.errors.length) { r.errors.forEach(e => console.error('error ' + e)); process.exit(1); }

const tpl = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
const html = assembleHtml(tpl, data);
const dist = path.join(ROOT, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'index.html'), html);
// Publish the raw data too, so others can consume it directly.
fs.cpSync(path.join(ROOT, 'data'), path.join(dist, 'data'), { recursive: true });
// Icons and the favicon (family strip, brand) are served beside index.html.
fs.cpSync(path.join(ROOT, 'src', 'assets'), dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'data', 'all.json'), JSON.stringify(data, null, 2) + '\n');
console.log(`Built dist/index.html with ${r.families} families, ${r.models} models, ${r.accessories} accessory catalogs (${r.warnings.length} warnings).`);
