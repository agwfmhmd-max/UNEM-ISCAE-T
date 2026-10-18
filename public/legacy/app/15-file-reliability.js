
/* =====================================================================
   موثوقية الفتح والتنزيل
   • التنزيل: يُجلب الملف (مع روابط بديلة) ثم يُوقَّع بتوقيع UNEM نفسه المستخدم عند الرفع
     (PDF / Word .docx / PowerPoint .pptx) ويُحفظ. ملفات GitHub وSupabase تُوقَّع دائماً؛
     ملفات Cloudinary موقّعة أصلاً عند رفعها فلا تُوقَّع مرتين. عند أي فشل → التنزيل القديم.
   • الفتح: عرض PDF عبر pdf.js من الملف المجلوب، وعند أي فشل → العارض القديم (Google).
   ===================================================================== */
(function () {
  'use strict';
  var MAX_SIGN_BYTES = 45 * 1024 * 1024;
  var cache = [];
  var seq = 0, pdfjsP = null, currentPdf = null, toastTimer = null;

  function abs(u) { try { return new URL(u, location.origin).href; } catch (_) { return u; } }
  function nameOf(f) { return String((f && (f.name || f.original_name)) || '').replace(/^"|"$/g, ''); }
  function extOf(n) { var m = /\.([A-Za-z0-9]+)$/.exec(n || ''); return m ? m[1].toLowerCase() : ''; }
  function isPdf(f) { return extOf(nameOf(f)) === 'pdf' || String((f && (f.mime_type || f.mimeType)) || '').toLowerCase() === 'application/pdf'; }

  function notify(msg, ms) {
    var el = document.getElementById('unem-fav-toast');
    if (!el) { el = document.createElement('div'); el.id = 'unem-fav-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg; void el.offsetWidth; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 2200);
  }

  /* روابط الجلب بالترتيب: الرابط الأساسي ← مرآة jsDelivr لملفات GitHub ← الوسيط /api/web-proxy */
  function candidates(f) {
    var list = [], primary = null;
    try { primary = getDocumentOpenUrl(f); } catch (_) {}
    if (primary) list.push(abs(primary));
    if (f.source === 'github') {
      try {
        var p = String(f.github_path || f.path || '').replace(/^"|"$/g, '');
        var br = f.branch || (typeof currentBranch !== 'undefined' && currentBranch) || 'main';
        if (p && typeof repoOwner !== 'undefined' && typeof repoName !== 'undefined') {
          list.push('https://cdn.jsdelivr.net/gh/' + repoOwner + '/' + repoName + '@' + br + '/' + p.split('/').map(encodeURIComponent).join('/'));
        }
      } catch (_) {}
    }
    if (primary && /^https?:/i.test(abs(primary))) list.push(location.origin + '/api/web-proxy?url=' + encodeURIComponent(abs(primary)));
    return list.filter(function (u, i, a) { return a.indexOf(u) === i; });
  }

  function readHead(blob) {
    return new Promise(function (resolve) {
      try {
        var r = new FileReader();
        r.onload = function () { resolve(String(r.result || '')); };
        r.onerror = function () { resolve(''); };
        r.readAsText(blob.slice(0, 1024));
      } catch (_) { resolve(''); }
    });
  }
  async function fetchOne(url, timeoutMs, need) {
    var ctl = window.AbortController ? new AbortController() : null;
    var to = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs) : null;
    try {
      var res = await fetch(url, { signal: ctl ? ctl.signal : undefined, credentials: 'omit' });
      if (!res.ok) return null;
      var blob = await res.blob();
      if (!blob || !blob.size) return null;
      if (need === 'pdf' && (await readHead(blob)).indexOf('%PDF') === -1) return null; // يرفض صفحات الخطأ ومؤشرات LFS
      if (need === 'zip' && (await readHead(blob)).slice(0, 2) !== 'PK') return null;   // docx/pptx = حزمة ZIP
      return blob;
    } catch (_) { return null; }
    finally { if (to) clearTimeout(to); }
  }
  async function getBlob(f, need) {
    var urls = candidates(f);
    if (!urls.length) return null;
    var key = urls[0];
    for (var c = 0; c < cache.length; c++) if (cache[c].key === key) return cache[c].blob;
    for (var i = 0; i < urls.length; i++) {
      var blob = await fetchOne(urls[i], i === 0 ? 20000 : 12000, need);
      if (blob) {
        cache.push({ key: key, blob: blob });
        while (cache.length > 2) cache.shift();
        return blob;
      }
    }
    return null;
  }

  /* ---------------- التنزيل الموقّع ---------------- */
  /* ملف موقّع أصلاً: مرفوع عبر Cloudinary (يُوقَّع عند الرفع)، أو اسمه ينتهي بكلمة Signed قبل الامتداد */
  /* كلمة Signed مستقلة في آخر الاسم (Cours_Signed / Cours-signed / Cours Signed / CoursSigned) — وليس Designed أو Assigned */
  var SIGNED_TAIL = /(^|[^a-z])signed[\s._\-()\[\]\d]*$/i, SIGNED_CAMEL = /[a-z]Signed[\s._\-()\[\]\d]*$/;
  function baseName(n) { return String(n || '').replace(/^.*[\\/]/, '').replace(/\.[A-Za-z0-9]{1,5}$/, '').trim(); }
  function alreadySigned(f, safeName) {
    if (!f) return false;
    if (f.source === 'cloudinary' || f.cloudinary_public_id || f.publicId) return true;
    if (/(^|\/\/)([\w-]+\.)*cloudinary\.com\//i.test(String(f.cloudinary_url || ''))) return true;
    return [safeName, f.name, f.original_name, f.github_path, f.path].some(function (n) { return n && (SIGNED_TAIL.test(baseName(n)) || SIGNED_CAMEL.test(baseName(n))); });
  }
  var MIME = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
  async function signedDownload(f, safeName) {
    var ext = extOf(safeName) || extOf(nameOf(f));
    var kind = (ext === 'pdf' || ext === 'docx' || ext === 'pptx') ? ext : (isPdf(f) ? 'pdf' : null);
    if (!kind) return false;                       // Excel / .doc / .ppt / صور: تُنزَّل كما هي
    if (alreadySigned(f, safeName)) return false;  // موقّع أصلاً (Cloudinary أو اسمه ينتهي بـ Signed) → لا يُوقَّع مرة ثانية
    var U = window.UNEMUpload;
    if (!U || typeof U.signPdfBlob !== 'function') return false;
    var native = window.AndroidFileDownload || null;
    var nativeB64 = !!(native && typeof native.savePdfBase64 === 'function');
    if (native && !(nativeB64 && kind === 'pdf')) return false; // تطبيق أندرويد لا يستقبل إلا PDF مباشرة → التنزيل الأصلي

    notify('⏳ جاري تجهيز الملف الموقّع...', 20000);
    var blob = await getBlob(f, kind === 'pdf' ? 'pdf' : 'zip');
    if (!blob || blob.size > MAX_SIGN_BYTES) { notify('⚠️ يتم التنزيل بدون توقيع'); return false; }

    var out = null;
    try {
      if (kind === 'pdf') out = await U.signPdfBlob(blob);
      else if (kind === 'docx') out = await U.signDocxBlob(new File([blob], safeName, { type: MIME.docx }));
      else out = await U.signPptxBlob(new File([blob], safeName, { type: MIME.pptx }));
    } catch (e) { console.warn('[UNEM] sign failed', e); out = null; }
    if (!out || !out.size) { notify('⚠️ يتم التنزيل بدون توقيع'); return false; }

    var fname = /\.[A-Za-z0-9]+$/.test(safeName) ? safeName : safeName + '.' + kind;
    if (nativeB64 && kind === 'pdf') {
      var bytes = new Uint8Array(await out.arrayBuffer()), bin = '', CH = 0x8000;
      for (var o = 0; o < bytes.length; o += CH) bin += String.fromCharCode.apply(null, bytes.subarray(o, Math.min(o + CH, bytes.length)));
      native.savePdfBase64(fname, btoa(bin));
      notify('✅ تم تجهيز الملف الموقّع');
      return true;
    }
    var url = URL.createObjectURL(new Blob([out], { type: MIME[kind] }));
    var a = document.createElement('a');
    a.href = url; a.download = fname; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    notify('✅ تم تنزيل الملف الموقّع');
    return true;
  }

  /* ---------------- عرض PDF عبر pdf.js ---------------- */
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve();
    if (!pdfjsP) pdfjsP = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = function () { try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; res(); } catch (e) { pdfjsP = null; rej(e); } };
      s.onerror = function () { pdfjsP = null; rej(new Error('pdf.js')); };
      document.head.appendChild(s);
    });
    return pdfjsP;
  }

  async function renderPdf(f, area) {
    if (!isPdf(f) || !area) return false;
    var tok = String(++seq); area.dataset.unemTok = tok;
    function dead() { return area.dataset.unemTok !== tok || !area.isConnected; }

    var blob = await getBlob(f, 'pdf');
    if (dead()) return true;                 // أُغلق العارض أو فُتح ملف آخر
    if (!blob) return false;
    await loadPdfJs();
    if (dead()) return true;
    var pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    if (dead()) { try { pdf.destroy(); } catch (_) {} return true; }
    if (currentPdf && currentPdf !== pdf) { try { currentPdf.destroy(); } catch (_) {} }
    currentPdf = pdf;

    var N = pdf.numPages, ratio = 1.414, zoom = 1, ZOOMS = [1, 1.5, 2, 3];
    var first = await pdf.getPage(1), v1 = first.getViewport({ scale: 1 });
    if (v1 && v1.width) ratio = v1.height / v1.width;

    var wrap = document.createElement('div');
    wrap.id = 'unem-pdf-wrap';
    wrap.style.cssText = 'position:absolute;inset:0;overflow:auto;-webkit-overflow-scrolling:touch;background:#e5e7eb;padding:8px 0 78px;direction:ltr;text-align:center';
    var pages = document.createElement('div');
    pages.style.cssText = 'width:100%;margin:0 auto';
    wrap.appendChild(pages);
    var els = [], state = [];
    for (var i = 1; i <= N; i++) {
      var d = document.createElement('div');
      d.className = 'unem-pg'; d.dataset.n = String(i);
      d.style.cssText = 'position:relative;margin:0 auto 8px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.25);width:100%;overflow:hidden';
      pages.appendChild(d); els[i] = d;
    }
    area.appendChild(wrap);

    function setHeights() { var w = pages.clientWidth || 360; for (var k = 1; k <= N; k++) if (state[k] !== true) els[k].style.height = Math.round(w * ratio) + 'px'; }
    setHeights();

    var chain = Promise.resolve();
    function renderPage(n) {
      chain = chain.then(async function () {
        if (dead() || state[n] === true || state[n] === 'p') return;
        state[n] = 'p';
        try {
          var pg = await pdf.getPage(n);
          var cssW = pages.clientWidth || 360;
          var base = pg.getViewport({ scale: 1 });
          var dpr = Math.min(window.devicePixelRatio || 1, 2);
          var vp = pg.getViewport({ scale: (cssW / base.width) * dpr });
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.floor(vp.width)); c.height = Math.max(1, Math.floor(vp.height));
          c.style.cssText = 'display:block;width:100%;height:auto';
          await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
          if (dead()) return;
          els[n].innerHTML = ''; els[n].appendChild(c); els[n].style.height = 'auto'; state[n] = true;
        } catch (e) { state[n] = false; if (n === 1) throw e; }
      });
      return chain;
    }
    function release(n) {
      if (state[n] !== true) return;
      els[n].innerHTML = ''; els[n].style.height = Math.round((pages.clientWidth || 360) * ratio) + 'px'; state[n] = false;
    }

    var io = null;
    try {
      await renderPage(1);                    // نجاح الصفحة الأولى = نجاح العرض
    } catch (e) { wrap.remove(); try { pdf.destroy(); } catch (_) {} return false; }
    if (window.IntersectionObserver) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var n = +en.target.dataset.n;
          if (en.isIntersecting) renderPage(n);
          else if (N > 60) release(n);
        });
      }, { root: wrap, rootMargin: '1400px 0px' });
      for (var j = 1; j <= N; j++) io.observe(els[j]);
    } else {
      for (var q = 2; q <= N; q++) renderPage(q);
    }

    /* أدوات تكبير/تصغير + رقم الصفحة */
    var bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:4;display:flex;align-items:center;gap:6px;background:rgba(15,23,42,.9);color:#fff;border-radius:999px;padding:6px 10px;font-weight:800;font-size:.8rem;direction:ltr;box-shadow:0 6px 18px rgba(0,0,0,.35)';
    function mk(txt, label, fn) { var b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.setAttribute('aria-label', label); b.style.cssText = 'background:rgba(255,255,255,.16);color:#fff;border:0;border-radius:50%;width:32px;height:32px;font-size:1.05rem;font-weight:900;cursor:pointer;line-height:1'; b.onclick = function (e) { e.stopPropagation(); fn(); }; return b; }
    var label = document.createElement('span'); label.style.cssText = 'min-width:56px;text-align:center'; label.textContent = '1 / ' + N;
    function applyZoom(z) {
      zoom = z; pages.style.width = (zoom * 100) + '%'; pages.style.margin = zoom > 1 ? '0' : '0 auto';
      for (var k = 1; k <= N; k++) { if (state[k] === true) { els[k].innerHTML = ''; state[k] = false; } }
      setHeights();
      if (io) { for (var m = 1; m <= N; m++) { io.unobserve(els[m]); io.observe(els[m]); } } else { for (var r = 1; r <= N; r++) renderPage(r); }
    }
    bar.appendChild(mk('−', 'zoom out', function () { var i0 = ZOOMS.indexOf(zoom); if (i0 > 0) applyZoom(ZOOMS[i0 - 1]); }));
    bar.appendChild(label);
    bar.appendChild(mk('+', 'zoom in', function () { var i0 = ZOOMS.indexOf(zoom); if (i0 < ZOOMS.length - 1) applyZoom(ZOOMS[i0 + 1]); }));
    area.appendChild(bar);
    wrap.addEventListener('scroll', function () {
      var h = (els[1].offsetHeight || 1) + 8;
      label.textContent = Math.min(N, Math.max(1, Math.floor(wrap.scrollTop / h) + 1)) + ' / ' + N;
    }, { passive: true });
    return true;
  }

  window.UNEMFiles = { alreadySigned: alreadySigned, candidates: candidates, getBlob: getBlob, signedDownload: signedDownload, renderPdf: renderPdf };
})();
