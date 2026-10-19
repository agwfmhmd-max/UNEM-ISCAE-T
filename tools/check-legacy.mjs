#!/usr/bin/env node
// فحص سريع بعد أي تعديل في الواجهة القديمة (app.html / emplois.html / community.html / resultats.html وملفات public/legacy/*.js):
//   1) فحص صياغة كل السكربتات (الخارجية والمضمّنة) كسكربتات عادية كما يحمّلها المتصفح.
//   2) فحص صياغة ملفات CSS (توازن الأقواس { } و( ) و[ ]، إغلاق التعليقات والنصوص) — المتصفح يتجاهل خطأ CSS بصمت ويُسقط ما بعده، لذلك نلتقطه هنا.
//   3) فحص أرقام الإصدار ?v= (اختيارياً تحديثها تلقائياً).
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

function css(label, code) {
  count++;
  let depth = 0, paren = 0, bracket = 0, i = 0, line = 1; const n = code.length;
  const fail = (m) => { bad++; console.error(`❌ خطأ CSS في ${label} (السطر ${line}): ${m}`); };
  while (i < n) {
    const c = code[i];
    if (c === '\n') line++;
    if (c === '/' && code[i + 1] === '*') { const e = code.indexOf('*/', i + 2); if (e < 0) return fail('تعليق /* غير مغلق'); line += (code.slice(i, e).match(/\n/g) || []).length; i = e + 2; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < n && code[j] !== c) { if (code[j] === '\\') j++; if (code[j] === '\n') return fail('نص مقتبس غير مغلق'); j++; } if (j >= n) return fail('نص مقتبس غير مغلق'); i = j + 1; continue; }
    if (c === '{') depth++; else if (c === '}') { depth--; if (depth < 0) return fail('} زائدة'); }
    else if (c === '(') paren++; else if (c === ')') { paren--; if (paren < 0) return fail(') زائدة'); }
    else if (c === '[') bracket++; else if (c === ']') { bracket--; if (bracket < 0) return fail('] زائدة'); }
    i++;
  }
  if (depth !== 0) fail(depth + ' قوس { غير مغلق');
  else if (paren !== 0) fail('قوس ( غير مغلق');
  else if (bracket !== 0) fail('قوس [ غير مغلق');
}

if (fix) {
  const r = spawnSync('node', [path.join(root, 'tools/bump-legacy.mjs')], { stdio: 'inherit' });
  if (r.status) bad++;
}

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walk(path.join(root, 'public/legacy')).filter((x) => x.endsWith('.js'))) syntax(path.relative(root, f), fs.readFileSync(f, 'utf8'));
for (const f of walk(path.join(root, 'public/legacy')).filter((x) => x.endsWith('.css'))) css(path.relative(root, f), fs.readFileSync(f, 'utf8'));
for (const f of fs.readdirSync(path.join(root, 'src/legacy')).filter((x) => x.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(root, 'src/legacy', f), 'utf8');
  const sre = /<style[^>]*>([\s\S]*?)<\/style>/g; let sm, si = 0;
  while ((sm = sre.exec(html))) { si++; if (sm[1].trim()) css(`src/legacy/${f} (<style> مضمّن #${si})`, sm[1]); }
  const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g; let m, i = 0;
  while ((m = re.exec(html))) { i++; if (/json|module/.test(m[1]) || !m[2].trim()) continue; syntax(`src/legacy/${f} (سكربت مضمّن #${i})`, m[2]); }
}
if (!fix) { const r = spawnSync('node', [path.join(root, 'tools/bump-legacy.mjs'), '--check'], { stdio: 'inherit' }); if (r.status) bad++; }
console.log(bad ? `\n❌ ${bad} مشكلة — أصلحها قبل النشر` : `\n✅ سليم: فُحص ${count} ملفاً/كتلة (JavaScript وCSS)، ولا مشاكل.`);
process.exit(bad ? 1 : 0);
