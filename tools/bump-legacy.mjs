#!/usr/bin/env node
// يحدّث رقم الإصدار ?v=… في وسوم <script src="/legacy/…"> و<link href="/legacy/….css"> و<img src="/legacy/…"> داخل src/legacy/*.html حسب محتوى الملف الفعلي.
// السبب: تُحمَّل سكربتات الواجهة كملفات منفصلة قابلة للتخزين المؤقت في المتصفح؛ تغيّر الرقم يجبر المتصفح على جلب النسخة الجديدة.
// الاستعمال:   node tools/bump-legacy.mjs          (تحديث)        |   node tools/bump-legacy.mjs --check   (فحص فقط؛ يفشل إن كان هناك رقم قديم)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const htmlDir = path.join(root, 'src/legacy');
let stale = 0, updated = 0;
for (const f of fs.readdirSync(htmlDir).filter((x) => x.endsWith('.html'))) {
  const p = path.join(htmlDir, f);
  const html = fs.readFileSync(p, 'utf8');
  const next = html.replace(/(<(?:script|link|img)\b[^>]*\b(?:src|href)=")(\/legacy\/[^"?]+)(?:\?v=[0-9a-f]+)?(")/g, (all, a, src, c) => {
    const file = path.join(root, 'public', src);
    if (!fs.existsSync(file)) { console.error('❌ ملف مفقود:', src, 'في', f); process.exitCode = 1; return all; }
    // نتجاهل CR قبل LF حتى لا يتغير الرقم إن حوّل Git/Windows نهايات الأسطر (المتصفح يحسب بنفس الطريقة في كاشف عدم التطابق)
    const raw = fs.readFileSync(file); const keep = []; for (let i = 0; i < raw.length; i++) { if (raw[i] === 13 && raw[i + 1] === 10) continue; keep.push(raw[i]); }
    const h = crypto.createHash('sha1').update(Buffer.from(keep)).digest('hex').slice(0, 10);
    return `${a}${src}?v=${h}${c}`;
  });
  if (next !== html) {
    if (check) { stale++; console.error('⚠️ أرقام الإصدار قديمة في', f); }
    else { fs.writeFileSync(p, next); updated++; console.log('✅ حُدّثت أرقام الإصدار في', f); }
  }
}
if (check && stale) { console.error('شغّل: node tools/bump-legacy.mjs'); process.exit(1); }
if (!check && !updated) console.log('لا تغييرات: كل أرقام الإصدار حديثة.');
