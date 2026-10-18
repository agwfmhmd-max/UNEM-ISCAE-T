// الحارس داخل app.html (CSS + خاصية على <html>) وكاشف عدم تطابق الملفات — على الصفحة الحقيقية كاملة.
import fs from 'node:fs';
import path from 'node:path';
import { suite, read, ROOT } from './helpers.mjs';
import { loadApp } from './load-app.mjs';

const flagsInit = (data) => `window.__rpc = { get_public_platform_stats: { data: ${JSON.stringify(data)}, error: null } };`;
const styleOf = (pg, sel) => pg.evaluate((s) => getComputedStyle(document.querySelector(s)).display, sel);

export default async function run() {
  const s = suite('الحارس داخل app.html + كاشف عدم تطابق الملفات (الصفحة كاملة)');
  const raw = read('src/legacy/app.html');

  // 1) افتراضياً (الخادم لا يعيد الحقلين): كل النوافذ مخفية حتى لو حاول أي كود قديم إظهارها
  let pg = await loadApp(raw, { initScript: flagsInit({ total_visitors: 1, registered_students: 1, show_visitors: true, show_registered: true }) });
  s.eq('ضبط خاصية التثبيت = off', await pg.evaluate(() => document.documentElement.getAttribute('data-install-prompt')), 'off');
  s.eq('ضبط خاصية الإشعارات = off', await pg.evaluate(() => document.documentElement.getAttribute('data-push-prompt')), 'off');
  await pg.evaluate(() => { document.getElementById('install-toast').classList.add('show'); document.getElementById('push-onboarding-modal').classList.remove('hidden'); document.getElementById('ios-install-modal').classList.remove('hidden'); });
  s.eq('نافذة التثبيت لا تُعرض حتى لو أُضيف لها show', await styleOf(pg, '#install-toast'), 'none');
  s.eq('نافذة الإشعارات لا تُعرض حتى لو أُزيل hidden', await styleOf(pg, '#push-onboarding-modal'), 'none');
  s.eq('تعليمات iPhone لا تُعرض', await styleOf(pg, '#ios-install-modal'), 'none');
  s.check('لا أخطاء جافاسكربت', pg.errors.length === 0, pg.errors);
  await pg.context().close();

  // 2) المشرف فعّل التثبيت فقط
  pg = await loadApp(raw, { initScript: flagsInit({ show_visitors: true, show_registered: true, show_install_prompt: true, show_push_prompt: false, prompts_reset_at: 0 }) });
  s.eq('التثبيت on والإشعارات off', await pg.evaluate(() => [document.documentElement.getAttribute('data-install-prompt'), document.documentElement.getAttribute('data-push-prompt')]), ['on', 'off']);
  await pg.evaluate(() => { document.getElementById('install-toast').classList.add('show'); document.getElementById('push-onboarding-modal').classList.remove('hidden'); });
  s.check('نافذة التثبيت تُعرض (فعّلها المشرف)', (await styleOf(pg, '#install-toast')) !== 'none');
  s.eq('نافذة الإشعارات تبقى مخفية', await styleOf(pg, '#push-onboarding-modal'), 'none');
  // تغيير الإعداد من لوحة المشرف يُطبَّق فوراً عبر unemPromptFlagsReset
  await pg.evaluate(() => { window.__rpc.get_public_platform_stats = { data: { show_install_prompt: false, show_push_prompt: true }, error: null }; window.unemPromptFlagsReset(); });
  await pg.waitForTimeout(400);
  s.eq('بعد تغيير المشرف: التثبيت off والإشعارات on', await pg.evaluate(() => [document.documentElement.getAttribute('data-install-prompt'), document.documentElement.getAttribute('data-push-prompt')]), ['off', 'on']);
  await pg.context().close();

  // 3) فشل الاتصال بالخادم: مخفية (لا تظهر إلا بتفعيل صريح)
  pg = await loadApp(raw, { initScript: 'window.__rpc = { get_public_platform_stats: { data: null, error: { message: "network" } } };' });
  s.eq('خطأ من الخادم → off', await pg.evaluate(() => [document.documentElement.getAttribute('data-install-prompt'), document.documentElement.getAttribute('data-push-prompt')]), ['off', 'off']);
  await pg.context().close();

  // 4) كاشف عدم التطابق: النسخة السليمة
  pg = await loadApp(raw);
  s.eq('كل الملفات تطابق app.html → لا تحذير', await pg.evaluate(() => window.unemVerifyBuild()), []);
  await pg.context().close();

  // 5) كاشف عدم التطابق: ملف قديم/مختلف على الخادم (السيناريو الحقيقي: رُفع app.html ولم يُرفع 03-main.js الجديد)
  pg = await loadApp(raw, { extraRoutes: async (r, u) => {
    if (u.pathname === '/legacy/app/03-main.js' && u.searchParams.has('chk')) { await r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* نسخة قديمة */' }); return true; }
    return false; } });
  const bad = await pg.evaluate(() => window.unemVerifyBuild());
  s.eq('ملف قديم على الخادم → يُكتشف باسمه', bad, ['03-main.js']);
  await pg.evaluate(() => {   // نحاكي فتح المشرف للوحة الإعدادات: نُظهر البطاقة وكل ما يحويها
    const c = document.getElementById('admin-onboarding-prompts-setting');
    for (let e = c; e && e !== document.body; e = e.parentElement) { if (getComputedStyle(e).display === 'none') e.style.setProperty('display', 'block', 'important'); e.classList.remove('hidden'); }
    c.scrollIntoView();
  });
  await pg.waitForTimeout(800);
  const shown = await pg.evaluate(() => { const b = document.getElementById('unem-build-warning'); return { vis: b.style.display, txt: b.textContent }; });
  s.check('التحذير يظهر في بطاقة المشرف عند فتحها', shown.vis === 'block' && /03-main\.js/.test(shown.txt) && /public\/legacy/.test(shown.txt), shown);
  await pg.context().close();

  // 6) نهايات الأسطر: CRLF لا تُحدث إنذاراً كاذباً
  pg = await loadApp(raw, { extraRoutes: async (r, u) => {
    if (u.pathname === '/legacy/app/02-i18n.js' && u.searchParams.has('chk')) { const t = fs.readFileSync(path.join(ROOT, 'public/legacy/app/02-i18n.js'), 'utf8').replace(/\n/g, '\r\n'); await r.fulfill({ status: 200, contentType: 'application/javascript', body: t }); return true; }
    return false; } });
  s.eq('اختلاف CRLF/LF وحده لا يُعدّ عدم تطابق', await pg.evaluate(() => window.unemVerifyBuild()), []);
  await pg.context().close();

  // 7) السيناريو الحقيقي: app.html جديد + 03-main.js قديم يتجاهل الإعدادات ويحاول إظهار النافذتين دائماً
  const stale = fs.readFileSync(path.join(ROOT, 'public/legacy/app/03-main.js'), 'utf8')
    .replace('whenFlags.then((f) => { if (f.push) showPushOnboardingNow(); })', 'Promise.resolve(showPushOnboardingNow())')
    .replace('if (f.install) installToast.classList.add(\'show\');', 'if (true) installToast.classList.add(\'show\');');
  s.check('تحضير نسخة «قديمة» تتجاهل الإعدادات (للاختبار)', !stale.includes('if (f.install) installToast') && !stale.includes('f.push) showPushOnboardingNow'));
  pg = await loadApp(raw, {
    initScript: flagsInit({ show_visitors: true, show_registered: true, show_install_prompt: false, show_push_prompt: false, prompts_reset_at: 0 }),
    extraRoutes: async (r, u) => {
      if (u.pathname === '/legacy/app/03-main.js' && !u.searchParams.has('chk')) { await r.fulfill({ status: 200, contentType: 'application/javascript', body: stale }); return true; }
      return false; } });
  await pg.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => {}; e.userChoice = Promise.resolve({ outcome: 'dismissed' }); window.dispatchEvent(e); });
  await pg.waitForTimeout(2500);
  const st = await pg.evaluate(() => ({ cls: document.getElementById('install-toast').classList.contains('show'), toast: getComputedStyle(document.getElementById('install-toast')).display, push: getComputedStyle(document.getElementById('push-onboarding-modal')).display }));
  s.check('المنطق القديم حاول إظهار نافذة التثبيت فعلاً (show مضاف)…', st.cls, st);
  s.check('…لكن الحارس أبقاها مخفية', st.toast === 'none' && st.push === 'none', st);
  await pg.context().close();
  return s.done();
}
