
/* =====================================================================
   تجديد اشتراكات الإشعارات المنتهية تلقائياً
   السبب: المتصفح/خدمة الإشعارات تُنهي الاشتراك (مسح بيانات الموقع، إعادة ضبط أذونات المواقع غير المستخدمة،
   تغيير مفتاح الخادم...) فيرفضها الخادم بالرمز 404/410 ويحذفها. هنا نُجدّدها بصمت عند فتح الموقع:
   • الإذن ما زال "granted" والاشتراك مفقود/منتهٍ/بمفتاح قديم → اشتراك جديد + حفظ في القاعدة (بدون أي نافذة).
   • الإذن أُعيد ضبطه إلى "default" بعد أن كان مفعّلاً → نعيد نافذة التفعيل الموجودة أصلاً لتُعرض مرة أخرى.
   • من أوقف الإشعارات بنفسه (unem_push_enabled = 0) أو حظرها من المتصفح لا نلمسه.
   ===================================================================== */
(function () {
  'use strict';
  var LAST = 'unem_push_heal_at', GAP = 6 * 3600 * 1000, WEEK = 7 * 24 * 3600 * 1000, running = false;

  function sameKey(buf, b64) {
    try {
      var a = new Uint8Array(buf), b = urlBase64ToUint8Array(b64);
      if (a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
      return true;
    } catch (_) { return true; }   // عند الشك لا نستبدل اشتراكاً قد يكون سليماً
  }

  async function heal() {
    if (running) return;
    try {
      if (typeof webPushSupported !== 'function' || !webPushSupported() || !unemPushOriginOk()) return;
      var perm = Notification.permission, flag = localStorage.getItem('unem_push_enabled');
      if (perm === 'denied' || flag === '0') return;
      if (perm === 'default') {
        if (flag === '1') localStorage.removeItem('unem_push_onboarding_done');  // أُلغي الإذن → أعد عرض نافذة التفعيل
        return;
      }
      running = true;
      var reg = await getPushServiceWorker();
      if (!reg) return;
      var key = null;
      try { var r = await fetch(unemApi('/api/public/push/vapid-key')); var d = await r.json(); key = d && d.publicKey; } catch (_) {}
      if (!key) return;                          // لا شبكة/الخادم غير مهيأ → لا نمس الاشتراك الحالي
      var sub = await reg.pushManager.getSubscription();
      var need = !sub;
      if (sub) {
        var cur = sub.options && sub.options.applicationServerKey;
        if (cur && !sameKey(cur, key)) need = true;                                   // مفتاح الخادم تغيّر
        if (sub.expirationTime && sub.expirationTime - Date.now() < WEEK) need = true; // قارب الانتهاء
      }
      if (need) {
        if (sub) { try { await sub.unsubscribe(); } catch (_) {} }
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
      }
      var saved = await savePushSubscriptionToDb(sub);   // upsert: يحدّث آخر ظهور أيضاً
      if (saved && saved.ok) {
        localStorage.setItem('unem_push_enabled', '1');
        localStorage.setItem(LAST, String(Date.now()));
        if (typeof setPushIcon === 'function') setPushIcon(true);
      }
    } catch (e) { console.warn('[UNEM] push self-heal', e); }
    finally { running = false; }
  }

  window.UNEMPushHeal = { run: heal };
  if (typeof webPushSupported === 'function' && webPushSupported()) {
    window.addEventListener('load', function () { setTimeout(heal, 2500); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      var last = +localStorage.getItem(LAST) || 0;
      if (Date.now() - last > GAP) heal();
    });
  }
})();
