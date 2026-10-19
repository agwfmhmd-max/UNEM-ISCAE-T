// تحكّم المشرف بنافذتي «ثبّت التطبيق» و«فعّل الإشعارات» + لوحة الإعدادات (عدّادات الصفحة الرئيسية والنوافذ).
import { suite, legacy, newPage, getBrowser, extractFn } from './helpers.mjs';

export default async function run() {
  const s = suite('تحكّم المشرف: نافذتا التثبيت والإشعارات + لوحة الإعدادات');
  const html = legacy('app.html');

  // ---------- الجزء 1: سلوك النافذتين عند الطلاب حسب إعدادات الخادم ----------
  const i = html.indexOf('// ================== تجربة المستخدم الجديد: التثبيت ثم الإشعارات');
  const k = html.indexOf('pushOnboardingBtn.disabled = false;', i);
  const j = html.indexOf('\n        });\n', k) + '\n        });\n'.length;
  const onb = 'function webPushSupported(){return true}\nfunction unemPushOriginOk(){return true}\nasync function subscribeToPush(){return true}\n' + html.slice(i, j);
  const shell = `<html><body><div id="install-toast"><p></p><button id="install-app-btn"></button><button id="close-install-btn"></button></div><div class="modal-overlay hidden" id="push-onboarding-modal"><button id="push-onboarding-btn"></button><p id="push-onboarding-status"></p></div><div class="modal-overlay hidden" id="ios-install-modal"></div></body></html>`;
  const b = await getBrowser();

  async function visit({ ua = 'android', stats, preset = {} }) {
    const ctx = await b.newContext(ua === 'ios' ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1' } : {});
    const p = await ctx.newPage(); p.errors = []; p.on('pageerror', (e) => p.errors.push(String(e)));
    await p.route('**/*', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: shell }));
    await p.addInitScript(([u, st, pre]) => {
      if (u === 'standalone') { const mm = window.matchMedia.bind(window); window.matchMedia = (q) => q.includes('standalone') ? { matches: true, addEventListener() {}, removeEventListener() {} } : mm(q); }
      Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'default' } });
      Object.entries(pre).forEach(([k2, v]) => localStorage.setItem(k2, v));
      window.__rpcCalls = 0;
      if (st === 'error') window.supabaseClient = { rpc: () => { window.__rpcCalls++; return Promise.resolve({ data: null, error: { message: 'function does not exist' } }); } };
      else if (st) window.supabaseClient = { rpc: () => { window.__rpcCalls++; return Promise.resolve({ data: st, error: null }); } };
    }, [ua, stats, preset]);
    await p.goto('http://localhost/');
    await p.evaluate((js) => { const sc = document.createElement('script'); sc.textContent = js; document.body.appendChild(sc); window.dispatchEvent(new Event('DOMContentLoaded')); }, onb);
    if (ua === 'android') await p.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => {}; e.userChoice = Promise.resolve({ outcome: 'dismissed' }); window.dispatchEvent(e); });
    await p.waitForTimeout(1900);
    const r = await p.evaluate(() => ({ toast: document.getElementById('install-toast').classList.contains('show'), push: !document.getElementById('push-onboarding-modal').classList.contains('hidden'), rpc: window.__rpcCalls,
      done: localStorage.getItem('unem_push_onboarding_done'), inst: localStorage.getItem('unem_install_state'), seen: localStorage.getItem('unem_prompts_reset_seen') }));
    r.errors = p.errors; await ctx.close(); return r;
  }
  const ST = (o) => ({ total_visitors: 10, registered_students: 5, show_visitors: true, show_registered: true, show_install_prompt: true, show_push_prompt: true, prompts_reset_at: 0, ...o });   // المشرف فعّل النافذتين

  let r = await visit({ ua: 'android', stats: ST({}) });
  s.check('المشرف فعّل النافذتين: أندرويد يرى نافذة التثبيت', r.toast && !r.push, r);
  r = await visit({ ua: 'android', stats: ST({ show_install_prompt: false }) });
  s.check('المشرف أخفى التثبيت: لا نافذة تثبيت وتظهر نافذة الإشعارات مباشرة', !r.toast && r.push, r);
  r = await visit({ ua: 'ios', stats: ST({ show_install_prompt: false }) });
  s.check('المشرف أخفى التثبيت: آيفون لا يرى تعليمات التثبيت', !r.toast, r);
  r = await visit({ ua: 'standalone', stats: ST({}) });
  s.check('تطبيق مثبّت (إشعارات مفعّلة من المشرف): تظهر نافذة الإشعارات', r.push, r);
  r = await visit({ ua: 'standalone', stats: ST({ show_push_prompt: false }) });
  s.check('المشرف أخفى الإشعارات: لا تظهر النافذة', !r.push, r);
  r = await visit({ ua: 'android', stats: ST({ show_install_prompt: false, show_push_prompt: false }) });
  s.check('إخفاء الاثنين: لا شيء يظهر ولا أخطاء', !r.toast && !r.push && r.errors.length === 0, r);
  r = await visit({ ua: 'android', stats: 'error' });
  s.check('خلل أو غياب ملف SQL: لا تظهر أي نافذة (لا تظهر إلا بتفعيل صريح)', !r.toast && !r.push, r);
  r = await visit({ ua: 'android', stats: null });
  s.check('بدون عميل Supabase: لا تظهر', !r.toast && !r.push, r);
  r = await visit({ ua: 'standalone', stats: { total_visitors: 1, registered_students: 1, show_visitors: true, show_registered: true } });
  s.check('الخادم لا يعيد حقلي النافذتين (ملف SQL لم يُشغَّل): تبقى مخفية', !r.toast && !r.push, r);
  r = await visit({ ua: 'android', stats: ST({ show_install_prompt: false, show_push_prompt: false }) });
  s.check('الافتراضي الجديد (مخفيتان): لا شيء يظهر للطالب الجديد', !r.toast && !r.push, r);
  // «إعادة الإظهار» من المشرف: من أغلقهما سابقاً تظهران له مجدداً مرة واحدة
  r = await visit({ ua: 'standalone', stats: ST({ prompts_reset_at: 2000000000 }), preset: { unem_push_onboarding_done: '1', unem_prompts_reset_seen: '1900000000' } });
  s.check('إعادة الإظهار: من أغلق نافذة الإشعارات تظهر له من جديد', r.push && r.seen === '2000000000', r);
  r = await visit({ ua: 'standalone', stats: ST({ prompts_reset_at: 2000000000 }), preset: { unem_push_onboarding_done: '1', unem_prompts_reset_seen: '2000000000' } });
  s.check('إعادة الإظهار لا تتكرر لنفس الإعادة (مرة واحدة فقط)', !r.push, r);
  r = await visit({ ua: 'android', stats: ST({ prompts_reset_at: 2000000000 }), preset: { unem_install_state: 'deferred' } });
  s.check('إعادة الإظهار: من اختار «لاحقاً» للتثبيت تظهر له نافذة التثبيت', r.toast && r.inst === 'new', r);
  r = await visit({ ua: 'android', stats: ST({}), preset: { unem_install_state: 'installed' } });
  s.check('من ثبّت التطبيق فعلاً لا تظهر له نافذة التثبيت أبداً', !r.toast, r);

  // ---------- الجزء 2: دوال لوحة الإعدادات (مفاتيح المشرف) ----------
  const fns = ['loadHomeStatsSettings', 'saveHomeStatSetting', 'loadPromptSettings', 'savePromptSetting', 'resetOnboardingPrompts'].map((n) => extractFn(html, n)).join('\n');
  const pg = await newPage();
  await pg.setContent(`<input type=checkbox id="home-visitors-toggle"><input type=checkbox id="home-registered-toggle"><input type=checkbox id="prompt-install-toggle"><input type=checkbox id="prompt-push-toggle"><div id="home-stats-status"></div><div id="prompts-status"></div>`);
  await pg.addScriptTag({ content: `
    let PERM=true;const hasPermission=()=>PERM;window.confirm=()=>true;window.__calls=[];window.FAIL=false;window.__flags=[];
    var STATE={show_visitors:true,show_registered:true,show_install_prompt:true,show_push_prompt:false};
    window.unemHomeStatsFlags=(a,b)=>window.__flags.push([a,b]);
    const supabaseClient={rpc:async(fn,a)=>{window.__calls.push([fn,a]);if(window.FAIL)return{data:null,error:{message:'function does not exist'}};
      if(fn==='get_public_platform_stats')return{data:STATE,error:null};
      if(fn==='set_public_stat_visibility')return{data:a.p_enabled,error:null};
      if(fn==='reset_onboarding_prompts')return{data:1900000001,error:null};}};
    ${fns}
    window.T={loadP:loadPromptSettings,saveP:savePromptSetting,reset:resetOnboardingPrompts,loadH:loadHomeStatsSettings,saveH:saveHomeStatSetting,setPerm:v=>{PERM=v}};` });
  await pg.evaluate(() => T.loadP());
  s.eq('تحميل الإعدادات: التثبيت مفعّل والإشعارات موقوفة', await pg.evaluate(() => [document.getElementById('prompt-install-toggle').checked, document.getElementById('prompt-push-toggle').checked]), [true, false]);
  await pg.evaluate(() => { STATE = { show_visitors: true, show_registered: true }; });
  await pg.evaluate(() => T.loadP());
  s.eq('إن لم يعد الخادم الحقلين: المفتاحان يظهران «مخفي» (لا يوهمان بأنهما مفعّلان)', await pg.evaluate(() => [document.getElementById('prompt-install-toggle').checked, document.getElementById('prompt-push-toggle').checked]), [false, false]);
  await pg.evaluate(() => { STATE = { show_visitors: true, show_registered: true, show_install_prompt: true, show_push_prompt: false }; });
  await pg.evaluate(() => T.saveP('show_push_prompt', true));
  const sv = await pg.evaluate(() => ({ call: window.__calls.slice(-1)[0], push: document.getElementById('prompt-push-toggle').checked, msg: document.getElementById('prompts-status').textContent }));
  s.check('حفظ مفتاح الإشعارات يرسل المفتاح الصحيح ويؤكد للمشرف', sv.call[1].p_key === 'show_push_prompt' && sv.call[1].p_enabled === true && sv.push && /✅/.test(sv.msg), sv);
  await pg.evaluate(() => T.saveP('show_install_prompt', false));
  s.eq('إخفاء التثبيت يرسل show_install_prompt=false', await pg.evaluate(() => window.__calls.slice(-1)[0][1]), { p_key: 'show_install_prompt', p_enabled: false });
  await pg.evaluate(() => { window.FAIL = true; document.getElementById('prompt-install-toggle').checked = true; });
  await pg.evaluate(() => T.saveP('show_install_prompt', true));
  s.check('فشل الحفظ: يرجع المفتاح ويظهر تنبيه SQL', await pg.evaluate(() => document.getElementById('prompt-install-toggle').checked === false && /20261027090000/.test(document.getElementById('prompts-status').textContent)));
  await pg.evaluate(() => { window.FAIL = false; window.__calls.length = 0; });
  await pg.evaluate(() => T.reset());
  s.check('زر «إعادة الإظهار» يستدعي reset_onboarding_prompts', await pg.evaluate(() => window.__calls.some((c) => c[0] === 'reset_onboarding_prompts') && /✅/.test(document.getElementById('prompts-status').textContent)));
  await pg.evaluate(() => { window.__calls.length = 0; T.setPerm(false); });
  await pg.evaluate(() => T.saveP('show_push_prompt', false)); await pg.evaluate(() => T.reset());
  s.eq('بدون صلاحية: لا يُرسل أي طلب', await pg.evaluate(() => window.__calls.length), 0);
  await pg.evaluate(() => { T.setPerm(true); });
  await pg.evaluate(() => T.saveH('show_registered_count', false));
  s.check('مفاتيح عدّادات الصفحة الرئيسية ما زالت تعمل', await pg.evaluate(() => window.__calls.slice(-1)[0][1].p_key === 'show_registered_count' && window.__flags.length >= 1));
  s.check('لا أخطاء جافاسكربت', pg.errors.length === 0, pg.errors);
  await pg.context().close();

  // ---------- الجزء 3: بطاقة الإعدادات موجودة وضمن صلاحية «إعدادات المنصة» ----------
  s.check('بطاقة النافذتين موجودة في لوحة المشرف', html.includes('id="admin-onboarding-prompts-setting"') && html.includes('prompt-install-toggle') && html.includes('prompt-push-toggle'));
  s.check('المعرّف مدرج في القوائم الثلاث + الكاشف يراقب البطاقة', html.split('admin-onboarding-prompts-setting').length - 1 >= 5);
  return s.done();
}
