// مساعدات مشتركة لاختبارات الواجهة. تعمل على ملفات المشروع الحقيقية (src/legacy/*.html و public/*.js).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
/** يقرأ صفحة من src/legacy ويُدرج بداخلها سكربتات /legacy/... الخارجية، فتبقى الاختبارات تتعامل مع «نص واحد» كما قبل التقسيم */
export const legacy = (name) => read('src/legacy/' + name).replace(
  /<script([^>]*?)\s+src="(\/legacy\/[^"?]+)(?:\?v=[0-9a-f]+)?"([^>]*)><\/script>/g,
  (all, a, src, b) => `<script${a}${b}>${fs.readFileSync(path.join(ROOT, 'public', src), 'utf8')}</script>`,
);

let browser = null;
export async function getBrowser() {
  if (browser) return browser;
  const opts = { args: ['--no-sandbox'] };
  if (process.env.CHROME_PATH) opts.executablePath = process.env.CHROME_PATH;
  browser = await chromium.launch(opts);
  return browser;
}
export async function closeBrowser() { if (browser) await browser.close(); browser = null; }

/** استخراج دالة (عادية أو async) من نص HTML/JS بالاسم مع مطابقة الأقواس */
export function extractFn(src, name) {
  const m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('الدالة غير موجودة: ' + name);
  const open = src.indexOf('{', src.indexOf(')', m.index));
  let d = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(m.index, k + 1); }
  }
  throw new Error('أقواس غير متطابقة: ' + name);
}

/** استخراج كل سكربتات النص العادية (غير الخارجية) من صفحة */
export function inlineScripts(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    if (/json|module/.test(m[1]) || !m[2].trim()) continue;
    out.push({ attrs: m[1], code: m[2] });
  }
  return out;
}

/** مشغّل اختبارات بسيط */
export function suite(name) {
  const results = [];
  const check = (label, cond, extra) => {
    results.push({ label, ok: !!cond, extra });
    console.log((cond ? '  ✅ ' : '  ❌ ') + label + (!cond && extra !== undefined ? '  → ' + JSON.stringify(extra) : ''));
  };
  const eq = (label, got, want) => check(label, JSON.stringify(got) === JSON.stringify(want), { got, want });
  const done = () => {
    const bad = results.filter((r) => !r.ok).length;
    console.log(`${bad ? '❌' : '✅'} ${name}: ${results.length - bad}/${results.length}`);
    return bad;
  };
  console.log('\n▶ ' + name);
  return { check, eq, done };
}

export async function newPage(opts = {}) {
  const b = await getBrowser();
  const ctx = await b.newContext(opts);
  const pg = await ctx.newPage();
  pg.errors = [];
  pg.on('pageerror', (e) => pg.errors.push(String(e)));
  return pg;
}
