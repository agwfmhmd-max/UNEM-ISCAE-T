// الصفحة الرئيسية: عدّاد الزوار والمسجلين (+ تحكم المشرف)، صورة الشارة، ونافذتا التثبيت والإشعارات.
import { suite, legacy, newPage, getBrowser, extractFn } from './helpers.mjs';

const AV = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

function between(html, startMarker, endMarker) {
  const i = html.indexOf(startMarker); if (i < 0) throw new Error('marker ' + startMarker);
  const j = html.indexOf(endMarker, i); return html.slice(i + startMarker.length, j);
}

export default async function run() {
  const s = suite('الصفحة الرئيسية: العدّادان + الشارة + نوافذ التثبيت والإشعارات');
  const html = legacy('app.html');
  const hwJs = between(html, '<script id="home-welcome-script">', '</script>');
  const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]).filter((x) => /home-welcome|hw-visits|hw-stats/.test(x)).join('\n');
  const section = /<section[^>]*id="home-welcome"[\s\S]*?<\/section>/.exec(html)[0];
  const page = `<html dir="rtl"><head>${styles}</head><body><div id="main-menu">${section}</div></body></html>`;

  async function scenario(name, rpcFn, opts = {}) {
    const pg = await newPage({ viewport: { width: opts.width || 390, height: 500 } });
    await pg.route('**/*', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: page }));
    await pg.addInitScript(([rpcSrc, student, av]) => {
      window.supabaseClient = { rpc: (fn) => Promise.resolve(eval('(' + rpcSrc + ')')(fn)) };
      window.matchMedia = (q) => ({ matches: /reduced-motion/.test(q), addEventListener() {}, removeEventListener() {} });
      if (student) { localStorage.setItem('unem_student', JSON.stringify(student)); localStorage.setItem('unem_community_token', 'x'.repeat(40)); }
      if (av) window.__AV = av;
    }, [rpcFn.toString(), opts.student || null, AV]);
    await pg.goto('http://localhost/');
    await pg.addScriptTag({ content: hwJs });
    await pg.waitForTimeout(500);
    return pg;
  }
  const state = (pg) => pg.evaluate(() => { const g = (i) => document.getElementById(i), vis = (e) => e && e.style.display !== 'none';
    return { visits: vis(g('hw-visits')) ? g('hw-visits-n').textContent : null, regs: vis(g('hw-regs')) ? g('hw-regs-n').textContent : null, wrap: g('hw-stats').style.display !== 'none' }; });

  const both = (fn) => fn === 'get_public_platform_stats' ? { data: { total_visitors: 3037, registered_students: 412, show_visitors: true, show_registered: true }, error: null } : { data: null, error: { message: 'x' } };
  let pg = await scenario('both', both);
  s.eq('الاثنان ظاهران', await state(pg), { visits: '3,037', regs: '412', wrap: true });
  await pg.evaluate(() => window.unemHomeStatsFlags(null, false)); await pg.waitForTimeout(80);
  s.eq('المشرف يخفي المسجلين فوراً', await state(pg), { visits: '3,037', regs: null, wrap: true });
  await pg.evaluate(() => window.unemHomeStatsFlags(false, false)); await pg.waitForTimeout(80);
  s.check('إخفاء الاثنين يخفي الحاوية', (await state(pg)).wrap === false);
  await pg.evaluate(() => window.unemHomeStatsFlags(true, true)); await pg.waitForTimeout(80);
  s.check('إعادة الإظهار', (await state(pg)).regs !== null);
  await pg.context().close();

  pg = await scenario('regs hidden', (fn) => fn === 'get_public_platform_stats' ? { data: { total_visitors: 3037, registered_students: null, show_visitors: true, show_registered: false }, error: null } : { data: null, error: { message: 'x' } });
  s.eq('المسجلون مخفيون من الخادم', await state(pg), { visits: '3,037', regs: null, wrap: true }); await pg.context().close();
  pg = await scenario('visitors hidden', (fn) => fn === 'get_public_platform_stats' ? { data: { total_visitors: null, registered_students: 412, show_visitors: false, show_registered: true }, error: null } : { data: null, error: { message: 'x' } });
  s.eq('الزوار مخفيون من الخادم', await state(pg), { visits: null, regs: '412', wrap: true }); await pg.context().close();
  pg = await scenario('legacy DB', (fn) => fn === 'get_public_visitor_stats' ? { data: { total_visitors: 3037 }, error: null } : { data: null, error: { message: 'function does not exist' } });
  s.eq('قاعدة قديمة (قبل ملف SQL): عدّاد الزوار القديم يعمل ولا ينكسر شيء', await state(pg), { visits: '3,037', regs: null, wrap: true }); await pg.context().close();

  // --- صورة الشارة (MA → الصورة) بما فيها حالة «مشرف وطالب»
  const st = { status: 'approved', name: 'Mohamed Dah Agove', reg: 'I21567', spec: 'BA', level: 'L3' };
  const badge = (admin, account) => (fn) => ({ data: { id: 'x', name: 'Mohamed Dah Agove', avatar_data: window.__AV, admin, account }, error: null });
  for (const [label, admin, account, want] of [['طالب عادي', false, 'a', true], ['مشرف وطالب معاً', true, 'a', true], ['مشرف فقط (بلا حساب طالب)', true, null, false]]) {
    const fnSrc = `(fn)=>({data:{id:'x',name:'Mohamed Dah Agove',avatar_data:window.__AV,admin:${admin},account:${account ? "'a'" : 'null'}},error:null})`;
    const p = await newPage();
    await p.route('**/*', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: `<html><body><div id="main-menu"><section id="home-welcome"><div><span id="hw-avatar"><svg></svg></span><span id="hw-kicker"></span><b id="hw-line"></b><small id="hw-sub"></small><div id="hw-chips"></div></div><div id="hw-stats" style="display:none"><div id="hw-visits"><b id="hw-visits-n"></b><small id="hw-visits-l"></small></div><div id="hw-regs"><b id="hw-regs-n"></b><small id="hw-regs-l"></small></div></div></section></div></body></html>` }));
    await p.addInitScript(([src, stu, av]) => { window.__AV = av; window.supabaseClient = { rpc: () => Promise.resolve(eval(src)()) };
      localStorage.setItem('unem_student', JSON.stringify(stu)); localStorage.setItem('unem_community_token', 'x'.repeat(40)); }, [fnSrc, st, AV]);
    // نستبدل fetch: الشارة تستعمل fetch إلى rpc/community_api
    await p.route('**/rest/v1/rpc/community_api', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: 'x', name: 'Mohamed Dah Agove', avatar_data: AV, admin, account }) }));
    await p.goto('http://localhost/'); await p.addScriptTag({ content: hwJs }); await p.waitForTimeout(1200);
    s.eq('الشارة: ' + label, await p.evaluate(() => !!document.querySelector('#hw-avatar img')), want);
    await p.context().close();
  }

  // --- نافذتا التثبيت والإشعارات (الكتلة الأصلية من app.html)
  const i = html.indexOf('// ================== تجربة المستخدم الجديد: التثبيت ثم الإشعارات');
  const k = html.indexOf('pushOnboardingBtn.disabled = false;', i);
  const j = html.indexOf('\n        });\n', k) + '\n        });\n'.length;
  const onb = 'function webPushSupported(){return true}\nfunction unemPushOriginOk(){return true}\nasync function subscribeToPush(){return true}\n' + html.slice(i, j);
  s.check('لا بقايا لمفتاح تعطيل النوافذ', !html.includes('UNEM_SHOW_ONBOARDING_PROMPTS'));
  const shell = `<html><body><div id="install-toast"><p></p><button id="install-app-btn"></button><button id="close-install-btn"></button></div><div class="modal-overlay hidden" id="push-onboarding-modal"><button id="push-onboarding-btn"></button><p id="push-onboarding-status"></p></div><div class="modal-overlay hidden" id="ios-install-modal"></div></body></html>`;
  const b = await getBrowser();
  for (const ua of ['android', 'ios', 'standalone']) {
    const ctx = await b.newContext(ua === 'ios' ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1' } : {});
    const p = await ctx.newPage();
    await p.route('**/*', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: shell }));
    await p.addInitScript(() => { window.supabaseClient = { rpc: () => Promise.resolve({ data: { show_install_prompt: true, show_push_prompt: true, prompts_reset_at: 0 }, error: null }) }; });
    await p.addInitScript((u) => { if (u === 'standalone') { const mm = window.matchMedia.bind(window); window.matchMedia = (q) => q.includes('standalone') ? { matches: true, addEventListener() {}, removeEventListener() {} } : mm(q); } Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'default' } }); }, ua);
    await p.goto('http://localhost/');
    await p.evaluate((js) => { const sc = document.createElement('script'); sc.textContent = js; document.body.appendChild(sc); window.dispatchEvent(new Event('DOMContentLoaded')); }, onb);
    if (ua === 'android') await p.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => {}; e.userChoice = Promise.resolve({ outcome: 'dismissed' }); window.dispatchEvent(e); });
    await p.waitForTimeout(1600);
    const r = await p.evaluate(() => ({ toast: document.getElementById('install-toast').classList.contains('show'), push: !document.getElementById('push-onboarding-modal').classList.contains('hidden') }));
    if (ua === 'standalone') s.check('تطبيق مثبّت: تظهر نافذة تفعيل الإشعارات', r.push, r);
    else s.check(`${ua}: تظهر نافذة التثبيت`, r.toast, r);
    await ctx.close();
  }
  return s.done();
}
