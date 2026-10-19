#!/usr/bin/env node
// فحص الموقع الحي: الصفحة تعمل؟ وكل ملفات الواجهة المرفوعة (/legacy/...) تطابق ما يتوقعه app.html (يلتقط رفعاً ناقصاً أو قديماً)؟
// الاستعمال:   SITE_URL=https://example.vercel.app node tools/uptime-check.mjs
// يخرج برمز 1 عند أي مشكلة (فيفشل سير العمل ويصلك إشعار GitHub). بلا اعتماديات خارجية.
import crypto from 'node:crypto';

const base = (process.env.SITE_URL || process.argv[2] || '').replace(/\/+$/, '');
if (!base) { console.log('ℹ️ لا يوجد SITE_URL — تخطّي الفحص.'); process.exit(0); }
const TIMEOUT = Number(process.env.TIMEOUT_MS || 20000);
const problems = [];
const fail = (m) => { problems.push(m); console.error('❌ ' + m); };

async function get(path, { binary = false } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(base + path, { signal: ctl.signal, redirect: 'follow', headers: { 'cache-control': 'no-cache', 'user-agent': 'unem-uptime-check' } });
    const body = binary ? Buffer.from(await r.arrayBuffer()) : await r.text();
    return { ok: r.ok, status: r.status, body, ms: 0 };
  } catch (e) { return { ok: false, status: 0, body: binary ? Buffer.alloc(0) : '', error: String(e.message || e) }; }
  finally { clearTimeout(t); }
}
const sha = (buf) => { const keep = []; for (let i = 0; i < buf.length; i++) { if (buf[i] === 13 && buf[i + 1] === 10) continue; keep.push(buf[i]); } return crypto.createHash('sha1').update(Buffer.from(keep)).digest('hex').slice(0, 10); };

const t0 = Date.now();
const home = await get('/');
if (!home.ok) { fail(`الصفحة الرئيسية لا تعمل: ${home.status || home.error}`); }
else {
  console.log(`✅ الصفحة الرئيسية ${home.status} (${Date.now() - t0}ms، ${(home.body.length / 1024).toFixed(0)}KB)`);
  if (!/UNEM/.test(home.body)) fail('الصفحة الرئيسية لا تحوي محتوى المنصة المتوقع (UNEM)');
  const refs = [...home.body.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)="(\/legacy\/[^"?]+)\?v=([0-9a-f]+)"/g)].map((m) => ({ path: m[1], v: m[2] }));
  if (!refs.length) fail('لا توجد ملفات /legacy في الصفحة (الصفحة قديمة أو نسخة غير متوقعة)');
  let ok = 0;
  for (const ref of refs) {
    const r = await get(`${ref.path}?v=${ref.v}`, { binary: true });
    if (!r.ok) { fail(`ملف مفقود على الخادم: ${ref.path} (${r.status || r.error})`); continue; }
    const h = sha(r.body);
    if (h !== ref.v) fail(`الملف ${ref.path} على الخادم لا يطابق app.html (متوقع ${ref.v}، الموجود ${h}) — رُفعت نسخة قديمة منه أو نُسي رفعه`);
    else ok++;
  }
  if (refs.length) console.log(`${ok === refs.length ? '✅' : '⚠️'} ملفات الواجهة المطابقة: ${ok}/${refs.length}`);
}
for (const p of ['/sw.js', '/manifest.json']) { const r = await get(p); if (!r.ok) fail(`${p} غير متاح (${r.status || r.error})`); else console.log(`✅ ${p} ${r.status}`); }

if (problems.length) { console.error(`\n❌ ${problems.length} مشكلة في ${base}`); process.exit(1); }
console.log(`\n✅ الموقع سليم: ${base}`);
