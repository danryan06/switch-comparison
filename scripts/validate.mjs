import { loadData, validate } from './lib.mjs';
const r = validate(loadData());
r.warnings.forEach(w => console.warn('warn  ' + w));
r.errors.forEach(e => console.error('error ' + e));
console.log(`\n${r.families} families, ${r.models} models, ${r.errors.length} errors, ${r.warnings.length} warnings`);
process.exit(r.errors.length ? 1 : 0);
