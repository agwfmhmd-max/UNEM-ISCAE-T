// تحميل الصفحة الرئيسية الحقيقية كاملة: كل سكربتات /legacy تُحمَّل، لا أخطاء جافاسكربت، العناصر الأساسية موجودة، وأرقام الإصدار حديثة.
import { suite, legacy, read, ROOT } from './helpers.mjs';
import { loadApp, snapshot } from './load-app.mjs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

export default async function run() {
  const s = suite('تحميل الصفحة الرئيسية كاملة (السكربتات المنفصلة)');
  const raw = read('src/legacy/app.html');
  const srcs = [...raw.matchAll(/<script[^>]*\bsrc="(\/legacy\/[^"?]+)\?v=[0-9a-f]+"/g)].map((m) => m[1]);
  s.check('18 سكربتاً مفصولاً مرجعاً في app.html', srcs.length === 18, srcs.length);
  const chk = spawnSync('node', [path.join(ROOT, 'tools/bump-legacy.mjs'), '--check']);
  s.check('أرقام الإصدار ?v= حديثة (وإلا شغّل: node tools/bump-legacy.mjs)', chk.status === 0, String(chk.stderr));
  const pg = await loadApp(raw);
  const snap = await snapshot(pg);
  s.check('كل ملفات /legacy حُمّلت بنجاح', srcs.every((x) => pg.loaded.includes(x)), srcs.filter((x) => !pg.loaded.includes(x)));
  s.check('لا طلبات 404 لملفات الواجهة', !pg.failed.some((f) => f.startsWith('/legacy')), pg.failed);
  s.check('لا أخطاء جافاسكربت عند التحميل', pg.errors.length === 0, pg.errors);
  s.check('العناصر الأساسية موجودة (أزرار وبطاقات)', snap.buttons > 50 && snap.cards > 40, snap);
  s.check('الدوال العامة محمّلة (>1000)', snap.fnCount > 1000, snap.fnCount);
  s.check('حجم HTML أقل من 800KB (كان 1.5MB قبل التقسيم)', Buffer.byteLength(raw) < 800 * 1024, Buffer.byteLength(raw));
  s.check('نسخة «inline» المدمجة للاختبارات تحتوي كل الشيفرة', legacy('app.html').length > 1.4e6);
  await pg.context().close();
  return s.done();
}
