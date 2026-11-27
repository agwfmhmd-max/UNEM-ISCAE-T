import { suite, newPage, read } from './helpers.mjs';

export default async function run() {
  const s = suite('مساعد التصنيف الذكي: صور Android ونتائج API');
  const pg = await newPage();
  await pg.setContent('<html><head></head><body></body></html>');
  await pg.addScriptTag({ content: read('public/legacy/app/09-smart-upload.js') });

  const successful = await pg.evaluate(async () => {
    let received = null;
    window.uploadQueue = [];
    window.getAccessToken = async () => 'test-session';
    window.unemApi = (path) => path;
    window.renderUploadQueue = () => {};
    window.fetch = async (_url, options) => {
      received = JSON.parse(options.body);
      return new Response(JSON.stringify({
        specialization: 'BA', level: 'L1', semester: 'S1', subject: 'Microéconomie',
        type: 'examen', confidence: 0.91, source: 'vision',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    // Samsung/Android devices can expose the non-canonical image/jpg MIME.
    const file = new File(['mock-image-bytes'], 'IMG-20261127.jpg', { type: 'image/jpg' });
    const item = { file, state: 'pending', message: 'في الانتظار' };
    window.uploadQueue.push(item);
    await window.UNEMSmartUpload.analyzeQueuedFile(file);
    return { mime: received && received.mime, dataPrefix: received && received.data.slice(0, 23), state: item.smartState, source: item.smart && item.smart.source, confidence: item.smart && item.smart.confidence };
  });
  s.eq('image/jpg يحوّل إلى image/jpeg ويُرسل لمساعد الرؤية', successful, {
    mime: 'image/jpeg', dataPrefix: 'data:image/jpeg;base64,', state: 'done', source: 'vision', confidence: true,
  });

  const failed = await pg.evaluate(async () => {
    window.uploadQueue = [];
    window.getAccessToken = async () => 'test-session';
    window.unemApi = (path) => path;
    window.renderUploadQueue = () => {};
    window.Tesseract = {
      createWorker: async () => ({ recognize: async () => ({ data: { text: '' } }) }),
    };
    window.fetch = async () => new Response(JSON.stringify({ error: 'مساعد التصنيف غير مهيأ على الخادم.' }), {
      status: 503, headers: { 'content-type': 'application/json' },
    });
    const file = new File(['mock-image-bytes'], 'document.png', { type: 'image/png' });
    const item = { file, state: 'pending', message: 'في الانتظار' };
    window.uploadQueue.push(item);
    await window.UNEMSmartUpload.analyzeQueuedFile(file);
    return { state: item.smartState, message: item.smartMessage };
  });
  s.check('يظهر سبب تعذّر الاتصال بدلاً من رسالة عامة صامتة', failed.state === 'partial' && failed.message.includes('مساعد التصنيف غير مهيأ على الخادم.'));

  await pg.context().close();
  return s.done();
}
