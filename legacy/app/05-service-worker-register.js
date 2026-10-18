
      let newWorker;
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('sw.js').then(reg => {
            console.log('SW Registered');
            
            // 1. فحص التحديث فور تشغيل التطبيق المثبت
            reg.update();

            // 2. فحص التحديث عند عودة الطالب للتطبيق (App Focus)
            window.addEventListener('focus', () => {
                reg.update();
            });

            // 3. فحص التحديث عند ظهور شاشة التطبيق
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    reg.update();
                }
            });

            // 4. فحص صامت كل 15 دقيقة (لتوفير بطارية الطلاب وبيانات الإنترنت)
            setInterval(() => {
                reg.update();
            }, 15 * 60 * 1000);

            reg.addEventListener('updatefound', () => {
              newWorker = reg.installing;
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  
                  // --- نظام الفحص الذكي للإصدارات، النتائج، والتظلمات (بالأرقام الصحيحة) ---
                  fetch('sw.js?t=' + new Date().getTime()) // تجاوز الكاش تماماً
                    .then(res => res.text())
                    .then(text => {
                        
                        // 1. رسالة التحديث العام الافتراضية
                        let customMsg = currentLang === 'ar' 
                            ? (typeof i18n !== 'undefined' && i18n['ar']['update_msg'] ? i18n['ar']['update_msg'] : 'تحديث جديد متاح للموقع 🔄')
                            : (typeof i18n !== 'undefined' && i18n['fr']['update_msg'] ? i18n['fr']['update_msg'] : 'Une nouvelle mise à jour est disponible 🔄');
                        
                        try {
                            // 2. استخراج السطر الذي يحتوي على CACHE_NAME
                            const cacheLineMatch = text.match(/CACHE_NAME\s*=\s*['"](.*?)['"]/);
                            
                            if (cacheLineMatch && cacheLineMatch[1]) {
                                const cacheValue = cacheLineMatch[1]; // يستخرج مثلا: unem-iscae-v1000
                                
                                // 3. استخراج الرقم بعد حرف v
                                const numberMatch = cacheValue.match(/[vV](\d+)/);
                                
                                if (numberMatch && numberMatch[1]) {
                                    const versionNumber = parseInt(numberMatch[1], 10);
                                    
                                    let semesterNumber = 0;
                                    let isAppeal = false;

                                    // فحص الأرقام: 1000 إلى 6000 (النتائج العادية)
                                    if (versionNumber >= 1000 && versionNumber <= 6000 && versionNumber % 1000 === 0) {
                                        semesterNumber = versionNumber / 1000;
                                        isAppeal = false;
                                    } 
                                    // فحص الأرقام: 10000 إلى 60000 (التظلمات)
                                    else if (versionNumber >= 10000 && versionNumber <= 60000 && versionNumber % 10000 === 0) {
                                        semesterNumber = versionNumber / 10000;
                                        isAppeal = true;
                                    }

                                    // إذا كان الرقم يطابق الحالات الخاصة بالنتائج والتظلمات
                                    if (semesterNumber > 0) {
                                        if (isAppeal) {
                                            customMsg = currentLang === 'ar' 
                                                ? `نتائج S${semesterNumber} بعد التظلمات أصبحت متاحة 🎓` 
                                                : `Les résultats de S${semesterNumber} après recours sont disponibles 🎓`;
                                        } else {
                                            customMsg = currentLang === 'ar' 
                                                ? `نتائج S${semesterNumber} أصبحت متاحة في الموقع 🎓` 
                                                : `Les résultats de S${semesterNumber} sont disponibles 🎓`;
                                        }
                                    }
                                    // أي رقم آخر (مثل 17، 25، 100) سيحتفظ بالرسالة الافتراضية "تحديث جديد متاح للموقع"
                                }
                            }
                        } catch (e) {
                            console.log("تم الاعتماد على رسالة التحديث الافتراضية");
                        }
                        
                        // 4. عرض الإشعار
                        const updateSpan = document.querySelector('#update-toast > span > span');
                        if (updateSpan) { updateSpan.textContent = customMsg; }
                        document.getElementById('update-toast').classList.add('show');
                    })
                    .catch(err => {
                        // في حالة فشل القراءة، نعرض إشعار التحديث لتجنب تعطل النظام
                        document.getElementById('update-toast').classList.add('show');
                    });
                  // ------------------------------------------

                }
              });
            });
          }).catch(err => { console.warn('SW registration failed:', err); });
          
          let refreshing;
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
          });
        });

        document.getElementById('update-btn').addEventListener('click', () => {
          document.getElementById('update-toast').classList.remove('show');
          if (newWorker) { newWorker.postMessage({ action: 'skipWaiting' }); } 
          else { window.location.reload(); }
        });
      }
    