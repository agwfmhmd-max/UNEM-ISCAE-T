#!/usr/bin/env node
// فحص سريع بعد أي تعديل في الواجهة القديمة (app.html / emplois.html / community.html / resultats.html وملفات public/legacy/*.js):
//   1) فحص صياغة كل السكربتات (الخارجية والمضمّنة) كسكربتات عادية كما يحمّلها المتصفح.
//   2) فحص أرقام الإصدار ?v= (اختيارياً تحديثها تلقائياً).
// الاستعمال:   node tools/check-legacy.mjs --fix     (يحدّث أرقام الإصدار ثم يفحص كل شيء)   |   node tools/check-legacy.mjs   (فحص فقط)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fix = process.argv.includes('--fix');
let bad = 0, count = 0;

function syntax(label, code) {
  count++;
  try { new vm.Script(code, { filename: label }); }
  catch (e) { bad++; console.error(`❌ خطأ صياغة في ${label}: ${e.message}`); }
}

if (fix) {
  const r = spawnSync('node', [path.join(root, 'tools/bump-legacy.mjs')], { stdio: 'inherit' });
  if (r.status) bad++;
}

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walk(path.join(root, 'public/legacy')).filter((x) => x.endsWith('.js'))) syntax(path.relative(root, f), fs.readFileSync(f, 'utf8'));
for (const f of fs.readdirSync(path.join(root, 'src/legacy')).filter((x) => x.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(root, 'src/legacy', f), 'utf8');
  const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g; let m, i = 0;
  while ((m = re.exec(html))) { i++; if (/json|module/.test(m[1]) || !m[2].trim()) continue; syntax(`src/legacy/${f} (سكربت مضمّن #${i})`, m[2]); }
}
if (!fix) { const r = spawnSync('node', [path.join(root, 'tools/bump-legacy.mjs'), '--check'], { stdio: 'inherit' }); if (r.status) bad++; }
console.log(bad ? `\n❌ ${bad} مشكلة — أصلحها قبل النشر` : `\n✅ سليم: فُحص ${count} سكربتاً، ولا مشاكل.`);
process.exit(bad ? 1 : 0);
