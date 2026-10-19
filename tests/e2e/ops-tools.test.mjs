// أدوات التشغيل: فحص الموقع الحي (uptime-check) يلتقط الرفع الناقص والملف القديم والموقع المتوقف.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { suite, ROOT } from './helpers.mjs';

function serve(mode) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      if (u.pathname === '/') { res.setHeader('content-type', 'text/html; charset=utf-8'); return res.end(fs.readFileSync(path.join(ROOT, 'src/legacy/app.html'))); }
      if (mode === 'missing' && u.pathname.endsWith('02-i18n.js')) { res.statusCode = 404; return res.end(); }
      const f = path.join(ROOT, 'public', u.pathname);
      if (fs.existsSync(f) && fs.statSync(f).isFile()) {
        let body = fs.readFileSync(f);
        if (mode === 'stale' && u.pathname.endsWith('.js') && u.pathname.includes('03-main-')) body = Buffer.from('/* نسخة قديمة */');
        if (mode === 'crlf' && u.pathname.endsWith('02-i18n.js')) body = Buffer.from(body.toString('utf8').replace(/\n/g, '\r\n'));
        return res.end(body);
      }
      res.statusCode = 404; res.end('nf');
    });
    srv.listen(0, () => resolve(srv));
  });
}
// غير متزامن عمداً: الخادم الوهمي يعمل داخل هذه العملية فلا يجوز تجميدها أثناء انتظار الأداة
const run = (url) => new Promise((resolve) => {
  const p = spawn('node', [path.join(ROOT, 'tools/uptime-check.mjs')], { env: { ...process.env, SITE_URL: url, TIMEOUT_MS: '3000' } });
  let stdout = '', stderr = '';
  p.stdout.on('data', (d) => { stdout += d; }); p.stderr.on('data', (d) => { stderr += d; });
  p.on('close', (status) => resolve({ status, stdout, stderr }));
});

export default async function run_() {
  const s = suite('أدوات التشغيل: فحص الموقع الحي');
  for (const [mode, expectOk, label] of [['ok', true, 'موقع سليم'], ['crlf', true, 'اختلاف نهايات الأسطر وحده لا يُعدّ خللاً'], ['stale', false, 'ملف قديم على الخادم'], ['missing', false, 'ملف مفقود (404)']]) {
    const srv = await serve(mode); const url = `http://localhost:${srv.address().port}`;
    const r = await run(url); srv.close();
    s.check(`${label}: الخروج ${expectOk ? '0' : '1'}`, (r.status === 0) === expectOk, { status: r.status, out: (r.stderr || r.stdout).slice(-300) });
    if (mode === 'stale') s.check('الرسالة تذكر اسم الملف القديم', /03-main-\d+-[a-z]+\.js.*لا يطابق/.test(r.stderr), r.stderr.slice(-300));
    if (mode === 'missing') s.check('الرسالة تذكر الملف المفقود', /02-i18n\.js.*404/.test(r.stderr), r.stderr.slice(-300));
  }
  const dead = await run('http://localhost:1');
  s.check('موقع متوقف: فشل (الخروج 1)', dead.status === 1, dead.status);
  const none = await new Promise((resolve) => { const p = spawn('node', [path.join(ROOT, 'tools/uptime-check.mjs')], { env: { ...process.env, SITE_URL: '' } }); let o = ''; p.stdout.on('data', (d) => { o += d; }); p.on('close', (c) => resolve({ status: c, stdout: o })); });
  s.check('بلا SITE_URL: تخطٍّ بلا فشل', none.status === 0 && /تخطّي/.test(none.stdout), none.stdout);
  return s.done();
}
