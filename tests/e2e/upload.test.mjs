// رفع الملفات (public/unem-upload.js): التحقق من الملف، تجهيزه، طلب التوقيع من الخادم، الرفع إلى Cloudinary، ورسائل الأخطاء.
import { suite, read, newPage } from './helpers.mjs';

export default async function run() {
  const s = suite('رفع ملف (طبقة الرفع الموحّدة)');
  const lib = read('public/unem-upload.js');
  const pg = await newPage();
  let signHits = 0, cloudHits = 0, lastForm = null, signMode = 'ok', cloudMode = 'ok';
  await pg.route('**/*', async (r) => {
    const u = r.request().url();
    if (u.endsWith('/api/public/cloudinary/sign')) {
      signHits++;
      if (signMode === 'forbidden') return r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'ليست لديك صلاحية الرفع' }) });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ apiKey: 'k', timestamp: 123, signature: 'sig', folder: 'unem/BA/L1', publicId: 'doc_1', uploadUrl: 'http://localhost/cloud/upload' }) });
    }
    if (u.endsWith('/cloud/upload')) {
      cloudHits++; lastForm = r.request().postData() || '';
      if (cloudMode === 'pdfblocked') return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'PDF delivery not allowed' } }) });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ secure_url: 'https://res.cloudinary.com/x/raw/upload/doc_1.pdf', public_id: 'unem/BA/L1/doc_1' }) });
    }
    if (u.endsWith('/')) return r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body></body></html>' });
    return r.fulfill({ status: 200, body: '' });
  });
  await pg.goto('http://localhost/');
  await pg.addScriptTag({ content: lib });
  const U = (fn, ...a) => pg.evaluate(([f, args]) => { const v = window.UNEMUpload[f](...args); return v; }, [fn, a]);

  // التحقق
  const val = (name, size) => pg.evaluate(([n, z]) => window.UNEMUpload.validateFile({ name: n, size: z }), [name, size]);
  s.eq('PDF سليم مقبول', await val('cours.pdf', 1000), null);
  s.check('نوع غير مدعوم مرفوض', /غير مدعوم/.test(await val('virus.exe', 1000)));
  s.check('ملف فارغ مرفوض', /فارغ/.test(await val('a.pdf', 0)));
  s.check('أكبر من 60MB مرفوض', /كبير جداً/.test(await val('a.pdf', 61 * 1024 * 1024)));
  s.check('اسم أطول من 180 حرفاً مرفوض', /طويل/.test(await val('a'.repeat(200) + '.pdf', 10)));
  s.check('لا ملف: رسالة', /لم يتم اختيار/.test(await pg.evaluate(() => window.UNEMUpload.validateFile(null))));
  s.eq('أنواع Office والصور مقبولة', await pg.evaluate(() => ['a.docx', 'b.pptx', 'c.xlsx', 'd.jpg', 'e.png', 'f.doc'].map((n) => window.UNEMUpload.validateFile({ name: n, size: 5 }))), [null, null, null, null, null, null]);

  // التجهيز: Excel يُرفع كما هو بلا توقيع
  const prep = await pg.evaluate(async () => { const f = new File([new Uint8Array([1, 2, 3])], 'notes.xlsx', { type: '' }); const r = await window.UNEMUpload.prepareFile(f); return { signed: r.signed, same: r.blob === f, kind: r.kind, rt: r.resourceType, ext: r.ext }; });
  s.eq('Excel لا يُعدَّل ولا يُوقَّع', prep, { signed: false, same: true, kind: 'excel', rt: 'raw', ext: 'xlsx' });

  // العارض المناسب
  s.check('صورة تُعرض مباشرة', await pg.evaluate(() => window.UNEMUpload.viewerUrlFor('a.png', 'https://x/a.png') === 'https://x/a.png'));
  s.check('PDF عبر عارض Google', await pg.evaluate(() => /docs\.google\.com\/gview/.test(window.UNEMUpload.viewerUrlFor('a.pdf', 'https://x/a.pdf'))));
  s.check('Word عبر عارض Office', await pg.evaluate(() => /officeapps\.live\.com/.test(window.UNEMUpload.viewerUrlFor('a.docx', 'https://x/a.docx'))));

  // مسار الرفع الكامل: توقيع الخادم ثم Cloudinary
  const ok = await pg.evaluate(async () => {
    const sig = await window.UNEMUpload.requestSignature({ fileName: 'cours.pdf' }, 'TOKEN');
    const prog = [];
    const res = await window.UNEMUpload.uploadSigned(sig, new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), 'cours.pdf', (p) => prog.push(p));
    return { sig, res };
  });
  s.eq('طلب التوقيع ثم الرفع يعيدان رابط الملف', [signHits, cloudHits, ok.res.secure_url], [1, 1, 'https://res.cloudinary.com/x/raw/upload/doc_1.pdf']);
  s.check('نموذج الرفع يحمل التوقيع والمجلد والمعرّف', ['api_key', 'timestamp', 'signature', 'folder', 'public_id', 'name="file"'].every((k) => lastForm.includes(k)) && lastForm.includes('unem/BA/L1') && lastForm.includes('doc_1'));

  // الأخطاء
  signMode = 'forbidden';
  const e1 = await pg.evaluate(async () => { try { await window.UNEMUpload.requestSignature({}, 'T'); return 'no-error'; } catch (e) { return e.message; } });
  s.check('بلا صلاحية: رسالة الخادم تصل للمستخدم', /صلاحية/.test(e1), e1);
  cloudMode = 'pdfblocked';
  const e2 = await pg.evaluate(async () => { try { await window.UNEMUpload.uploadSigned({ apiKey: 'k', timestamp: 1, signature: 's', folder: 'f', publicId: 'p', uploadUrl: 'http://localhost/cloud/upload' }, new Blob(['x']), 'a.pdf'); return 'no-error'; } catch (e) { return e.message; } });
  s.check('منع PDF في Cloudinary: رسالة إرشاد واضحة', /Allow delivery of PDF/.test(e2), e2);
  s.check('لا أخطاء جافاسكربت', pg.errors.length === 0, pg.errors);
  await pg.context().close();
  return s.done();
}
