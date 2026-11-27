import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT, loadData, assembleHtml } from '../scripts/lib.mjs';

describe('assembleHtml', () => {
  const html = assembleHtml(fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8'), loadData());

  test('fills both placeholders', () => {
    assert.ok(!html.includes('/*__DATA__*/null'));
    assert.ok(!html.includes('/*__SIZER__*/'));
    assert.ok(html.includes('function sizeOne('));
  });

  test('leaves no ES module syntax in the page', () => {
    assert.doesNotMatch(html, /^export\s/m);
  });

  test('the app script compiles (catches syntax errors and duplicate declarations)', () => {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    const app = scripts.find(s => s.includes('const DATA='));
    assert.ok(app, 'app script found');
    assert.doesNotThrow(() => new vm.Script(app, { filename: 'index.html' }));
  });

  test('replacement patterns in the inputs are inserted literally', () => {
    const tpl = '<script>/*__SIZER__*/\nconst DATA=/*__DATA__*/null;</script>';
    const out = assembleHtml(tpl, { note: "$& $' $` $$" }, 'export const x = "$&";\n');
    assert.ok(out.includes('const x = "$&";'));
    assert.ok(out.includes('"note":"$& $\' $` $$"'));
  });

  test('escapes < in the data so it cannot close the script tag', () => {
    const out = assembleHtml('<script>/*__SIZER__*/const DATA=/*__DATA__*/null;</script>', { s: '</script><b>' }, '');
    assert.ok(!out.includes('</script><b>'));
  });
});
