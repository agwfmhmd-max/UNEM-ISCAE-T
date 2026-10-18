
/* شريط البحث يظهر فقط عند دخول مسار الملخصات والأرشيف، ويُخفى في الرئيسية وبقية الصفحات */
(function () {
  var IDS = ['study-cycle-selection','specialization-selection','level-selection','semesters-container','subjects-container','category-selection-container','file-list-container'];
  function update() {
    var on = IDS.some(function (id) { var el = document.getElementById(id); return el && !el.classList.contains('hidden'); });
    document.documentElement.classList.toggle('unem-search-off', !on);
    if (!on) { var inp = document.getElementById('global-search'); if (inp && inp.value) inp.value = ''; }
  }
  try {
    if (window.MutationObserver) {
      var mo = new MutationObserver(update);
      IDS.forEach(function (id) { var el = document.getElementById(id); if (el) mo.observe(el, { attributes: true, attributeFilter: ['class'] }); });
    }
  } catch (_) {}
  try {
    var mm = document.getElementById('main-menu');
    if (mm && window.MutationObserver) {
      new MutationObserver(function () { if (!mm.classList.contains('hidden')) mm.scrollTop = 0; }).observe(mm, { attributes: true, attributeFilter: ['class'] });
    }
  } catch (_) {}
  update();
})();
