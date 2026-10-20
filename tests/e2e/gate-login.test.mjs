// تسجيل دخول الطالب (public/unem-gate.js): طالب موجود، طالب جديد، تحقق المدخلات، جهاز مستعمل وبلاغ انتحال.
import { suite, read, newPage } from './helpers.mjs';

export default async function run() {
  const s = suite('تسجيل دخول الطالب (البوابة)');
  const gate = read('public/unem-gate.js');

  async function open(handler) {
    const pg = await newPage({ viewport: { width: 390, height: 800 } });
    pg.rpcCalls = [];
    await pg.route('**/*', async (r) => {
      const u = r.request().url();
      if (u.includes('/rest/v1/rpc/student_gate')) {
        const body = JSON.parse(r.request().postData() || '{}');
        pg.rpcCalls.push(body);
        const out = await handler(body);
        return r.fulfill({ status: out.http || 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(out.body) });
      }
      if (u.endsWith('/community')) return r.fulfill({ status: 200, contentType: 'text/html', body: '<html><head><meta charset="utf-8"></head><body></body></html>' });
      return r.fulfill({ status: 200, body: '' });
    });
    await pg.goto('http://localhost/community');   // البوابة تطلب التسجيل في صفحة المجتمع فقط
    await pg.addScriptTag({ content: gate });
    await pg.waitForSelector('#ug-form', { timeout: 5000 });
    return pg;
  }

  // 1) طالب موجود → دخول مباشر
  let pg = await open((b) => {
    if (b.p_action === 'status') return { body: { status: 'none' } };
    if (b.p_action === 'lookup') return { body: { found: true } };
    if (b.p_action === 'login') return { body: { status: 'approved', name: 'Mohamed Dah Agove', reg: 'I21567', spec: 'BA', level: 'L3' } };
    return { body: {} };
  });
  await pg.fill('#ug-name', 'Mohamed Dah Agove'); await pg.fill('#ug-reg', 'I21567');
  await pg.click('#ug-go');
  await pg.waitForFunction(() => !document.getElementById('ug-form'), null, { timeout: 5000 });
  const stu = await pg.evaluate(() => JSON.parse(localStorage.getItem('unem_student') || 'null'));
  s.check('الدخول يحفظ الطالب ويزيل شاشة البوابة', stu && stu.status === 'approved' && stu.reg === 'I21567' && stu.level === 'L3', stu);
  s.eq('تسلسل الاستدعاءات: lookup ثم login', pg.rpcCalls.map((c) => c.p_action).filter((a) => a !== 'status'), ['lookup', 'login']);
  await pg.context().close();

  // 2) تحقق المدخلات قبل أي طلب
  pg = await open(() => ({ body: { status: 'none' } }));
  await pg.fill('#ug-name', 'ab'); await pg.fill('#ug-reg', 'I1'); await pg.click('#ug-go'); await pg.waitForTimeout(200);
  s.check('اسم قصير: رسالة خطأ بلا طلب للخادم', (await pg.$eval('#ug-err', (e) => e.style.display)) === 'block' && !pg.rpcCalls.some((c) => c.p_action === 'lookup'));
  await pg.fill('#ug-name', 'Valid Name'); await pg.fill('#ug-reg', 'x'); await pg.click('#ug-go'); await pg.waitForTimeout(200);
  s.check('رقم تسجيل قصير: رفض', !pg.rpcCalls.some((c) => c.p_action === 'lookup'));
  await pg.context().close();

  // 3) طالب جديد: lookup → نموذج إنشاء → create → بانتظار الموافقة → موافقة
  let approved = false;
  pg = await open((b) => {
    if (b.p_action === 'status') return { body: approved ? { status: 'approved', name: 'New Student', reg: 'I18077', spec: 'FC', level: 'L1' } : (pg.created ? { status: 'pending' } : { status: 'none' }) };
    if (b.p_action === 'lookup') return { body: { needs_registration: true } };
    if (b.p_action === 'create') { pg.created = true; return { body: { status: 'pending' } }; }
    return { body: {} };
  });
  await pg.fill('#ug-name', 'New Student'); await pg.fill('#ug-reg', 'I18077'); await pg.click('#ug-go');
  await pg.waitForSelector('#ug-spec', { timeout: 5000 });
  s.check('طالب غير معروف ينتقل لنموذج إنشاء الحساب', true);
  await pg.selectOption('#ug-spec', 'FC');
  await pg.selectOption('#ug-level', 'L1');
  await pg.click('#ug-go');
  await pg.waitForSelector('#ug-chk', { timeout: 5000 });
  const create = pg.rpcCalls.find((c) => c.p_action === 'create');
  s.check('إنشاء الحساب يرسل الاسم والرقم والتخصص والمستوى', create && create.p_args.name === 'New Student' && create.p_args.reg === 'I18077' && create.p_args.spec === 'FC' && create.p_args.level === 'L1', create);
  s.check('شاشة «بانتظار موافقة المشرف»', true);
  approved = true; await pg.click('#ug-chk');
  await pg.waitForFunction(() => !document.getElementById('ug-chk'), null, { timeout: 5000 });
  s.eq('بعد الموافقة يدخل الطالب', await pg.evaluate(() => JSON.parse(localStorage.getItem('unem_student') || '{}').status), 'approved');
  await pg.context().close();

  // 4) جهاز مستعمل
  pg = await open((b) => {
    if (b.p_action === 'lookup') return { body: { found: true } };
    if (b.p_action === 'login') return { http: 400, body: { message: 'device_in_use', code: 'P0001' } };
    if (b.p_action === 'report_device_in_use') return { body: { submitted: true } };
    return { body: { status: 'none' } };
  });
  await pg.fill('#ug-name', 'Mohamed Dah Agove'); await pg.fill('#ug-reg', 'I21567'); await pg.click('#ug-go'); await pg.waitForTimeout(600);
  s.check('device_in_use: رسالة خطأ والبوابة تبقى', (await pg.$eval('#ug-err', (e) => e.style.display)) === 'block' && !!(await pg.$('#ug-form')));
  pg.once('dialog', (d) => d.accept('شخص آخر يستخدم حسابي دون إذني وأطلب التحقق وحظر الجهاز.'));
  await pg.click('#ug-report'); await pg.waitForTimeout(250);
  s.check('device_in_use: إرسال البلاغ للمشرف', pg.rpcCalls.some((c) => c.p_action === 'report_device_in_use') && (await pg.$eval('#ug-err', (e) => e.textContent.includes('تم إرسال البلاغ'))));
  await pg.context().close();

  // 5) قفل مؤقت بعد محاولات خاطئة: الرسالة مفهومة ولا تُسقط البوابة.
  pg = await open((b) => b.p_action === 'lookup' ? { body: { error: 'too_many_attempts', retry_after: 15 } } : { body: { status: 'none' } });
  await pg.fill('#ug-name', 'Mohamed Dah Agove'); await pg.fill('#ug-reg', 'I21567'); await pg.click('#ug-go'); await pg.waitForTimeout(250);
  s.check('قفل المحاولات: رسالة انتظار والبوابة تبقى', (await pg.$eval('#ug-err', (e) => e.textContent.includes('15')) && !!(await pg.$('#ug-form'))));
  await pg.context().close();
  return s.done();
}
