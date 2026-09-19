import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadData, validate } from './lib.mjs';

const data = loadData();
const r = validate(data);
if (r.errors.length) { r.errors.forEach(e => console.error('error ' + e)); process.exit(1); }

const tpl = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
if (!tpl.includes('/*__DATA__*/null')) throw new Error('Data placeholder missing from src/index.html');
const json = JSON.stringify(data).replace(/</g, '\\u003c');
const dist = path.join(ROOT, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'index.html'), tpl.replace('/*__DATA__*/null', json));
// Publish the raw data too, so others can consume it directly.
fs.cpSync(path.join(ROOT, 'data'), path.join(dist, 'data'), { recursive: true });
fs.writeFileSync(path.join(dist, 'data', 'all.json'), JSON.stringify(data, null, 2) + '\n');
console.log(`Built dist/index.html with ${r.families} families and ${r.models} models (${r.warnings.length} warnings).`);
