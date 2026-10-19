// حارس بصري: بصمة الأنماط المحسوبة (computed styles) لكل جزء من الصفحات الرئيسية، مقارنةً بخط أساس محفوظ في tests/baselines/styles.json.
// يلتقط تغييراً غير مقصود في CSS أو في كلاسات HTML (لون، خط، إخفاء، ترتيب...). لا يقيس أبعاداً تعتمد على الخطوط حتى لا يختلف بين الأجهزة.
// عند تغيير تصميمي مقصود:  UPDATE_BASELINE=1 node run-all.mjs --e2e-only   ثم ارفع tests/baselines/styles.json
import fs from 'node:fs';
import path from 'node:path';
import { suite, legacy, ROOT, newPage, getBrowser } from './helpers.mjs';
import { loadApp } from './load-app.mjs';
import { MOCK } from './community.test.mjs';

const FILE = path.join(ROOT, 'tests/baselines/styles.json');
// قائمة ثابتة من الخصائص البصرية (لا نعدّ كل الخصائص: المتصفحات الأحدث تضيف خصائص جديدة فتتغير البصمة دون سبب حقيقي)
const PROPS = ['display','position','visibility','opacity','overflow-x','overflow-y','z-index','float','clear','box-sizing','color','background-color','background-image','background-size','background-repeat','background-position-x','background-position-y',
  'font-family','font-size','font-weight','font-style','line-height','letter-spacing','text-align','text-transform','text-decoration-line','text-overflow','white-space','word-break','direction','unicode-bidi','vertical-align',
  'border-top-style','border-right-style','border-bottom-style','border-left-style','border-top-width','border-right-width','border-bottom-width','border-left-width','border-top-color','border-right-color','border-bottom-color','border-left-color',
  'border-top-left-radius','border-top-right-radius','border-bottom-right-radius','border-bottom-left-radius','box-shadow','text-shadow','padding-top','padding-right','padding-bottom','padding-left',
  'flex-direction','flex-wrap','flex-grow','flex-shrink','justify-content','align-items','align-self','align-content','row-gap','column-gap','order','cursor','pointer-events','transform','filter','backdrop-filter','object-fit','list-style-type','mix-blend-mode','fill','stroke'];

const FREEZE = () => {   // يجمّد الحركات والانتقالات (قبل ظهور <html> أحياناً، فننتظره)
  const add = () => { const st = document.createElement('style'); st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'; (document.head || document.documentElement).appendChild(st); };
  if (document.documentElement) add(); else new MutationObserver((m, o) => { if (document.documentElement) { o.disconnect(); add(); } }).observe(document, { childList: true });
};

async function fingerprint(pg) {
  return pg.evaluate((props) => {
    const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); };
    const groups = {}; let count = 0;
    const els = [...document.querySelectorAll('body, body *')].filter((e) => !['SCRIPT', 'STYLE', 'LINK', 'NOSCRIPT', 'META', 'TEMPLATE'].includes(e.tagName));
    els.forEach((el) => {
      const cs = getComputedStyle(el); let line = el.tagName;
      for (const p of props) line += '|' + p + ':' + cs.getPropertyValue(p);
      let a = el; while (a && !a.id) a = a.parentElement;
      const key = a ? '#' + a.id : 'body';
      groups[key] = (groups[key] ? groups[key] + '\n' : '') + line; count++;
    });
    const out = {}; Object.keys(groups).sort().forEach((k) => { out[k] = fnv(groups[k]); });
    return { count, groups: out };
  }, PROPS);
}

async function pageState(name) {
  if (name.startsWith('community')) {
    const html = legacy('community.html');
    const pg = await newPage({ viewport: { width: 390, height: 844 } });
    await pg.route('**/*', (r) => { const u = r.request().url();
      if (u === 'http://localhost/community') return r.fulfill({ status: 200, contentType: 'text/html', body: html });
      if (u.includes('supabase-js') || u.includes('unem-gate')) return r.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
      if (u.startsWith('http://localhost')) return r.fulfill({ status: 200, body: '' });
      return r.abort(); });
    await pg.addInitScript(MOCK); await pg.addInitScript(FREEZE);
    await pg.addInitScript(() => { localStorage.setItem('unem_student', JSON.stringify({ status: 'approved', name: 'Mohamed Dah Agove', reg: 'I21567', spec: 'BA', level: 'L3' })); });
    await pg.goto('http://localhost/community'); await pg.waitForSelector('.card'); await pg.waitForTimeout(500);
    return pg;
  }
  const file = name.startsWith('app') ? 'app.html' : name.startsWith('emplois') ? 'emplois.html' : 'resultats.html';
  const w = name.includes('1280') ? 1280 : 390;
  const pg = await loadApp(legacy(file), { initScript: FREEZE });
  await pg.setViewportSize({ width: w, height: 844 });
  if (name.endsWith('dark')) await pg.evaluate(() => document.body.classList.add('dark-mode'));
  await pg.waitForTimeout(name.startsWith('app') ? 5200 : 800);
  return pg;
}

export const STATES = ['app-390', 'app-1280', 'app-390-dark', 'emplois-390', 'resultats-390', 'community-390'];

export default async function run() {
  const s = suite('حارس الأنماط البصري (خط أساس بصمات الأنماط المحسوبة)');
  const update = !!process.env.UPDATE_BASELINE;
  const base = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
  const next = {};
  const major = (await (await getBrowser()).version()).split('.')[0];
  next._meta = { chromium: major, note: 'يُولَّد بـ UPDATE_BASELINE=1 أو من سير العمل update-visual-baseline على GitHub' };
  const strict = !base._meta || base._meta.chromium === major;
  if (!strict) console.log(`  ℹ️ خط الأساس بُني بـ Chromium ${base._meta.chromium} والمتصفح الحالي ${major}: لا مقارنة صارمة (قد يختلف تنسيق القيم بين الإصدارات). ولّد خط أساس جديداً من سير العمل update-visual-baseline.`);
  for (const name of STATES) {
    const pg = await pageState(name);
    const fp = await fingerprint(pg);
    next[name] = fp;
    s.check(`${name}: بلا أخطاء جافاسكربت`, pg.errors.length === 0, pg.errors);
    if (!update) {
      const b = base[name];
      if (!b) { s.check(`${name}: خط الأساس موجود (شغّل UPDATE_BASELINE=1 لإنشائه)`, false); }
      else if (!strict) { s.check(`${name}: تخطٍّ (إصدار Chromium مختلف عن خط الأساس)`, true); }
      else {
        const changed = Object.keys({ ...b.groups, ...fp.groups }).filter((k) => b.groups[k] !== fp.groups[k]);
        s.check(`${name}: الأنماط مطابقة لخط الأساس (${fp.count} عنصراً)`, changed.length === 0, { changedGroups: changed.slice(0, 12), total: changed.length, hint: 'إن كان التغيير مقصوداً: UPDATE_BASELINE=1' });
      }
    }
    await pg.context().close();
  }
  if (update) { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(next, null, 1) + '\n'); s.check('تم تحديث خط الأساس: ' + path.relative(ROOT, FILE), true); }
  return s.done();
}
