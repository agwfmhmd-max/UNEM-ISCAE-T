/* ===== تقسيم 03-main.js — دوال =====
   يُحمَّل بعد الملفات التي تسبقه وقبل التي تليه (الترتيب محدد في src/legacy/app.html).
   الدوال: downloadStatsImage، adminLogin، adminLogout، closeAdminLogin، loadActiveAnnouncement، closeAnnouncementBar، loadAnnouncementsAdmin، saveAnnouncement، deleteAnnouncement، urlBase64ToUint8Array، isAndroidWebView، webPushSupported، unemPushOriginOk، getPushServiceWorker، nativeFcmSupported، pushSupported، openPushInSupportedBrowser، setPushIcon، initPushUI، subscribeToPush، savePushSubscriptionToDb، unsubscribeFromPush، togglePushNotifications، sendPushNotificationAdmin، cleanupExpiredPushSubscriptions، loadPushActiveDeviceCount، loadPushHistoryAdmin، hideAll، goBackToMainMenu، goBackToSpecialization، goBackToLevels، goBackToSemesters، goBackToSubjects، goBackToCategories، showStudyCycleSelection، goBackToStudyCycleSelection، showSpecializationSelection، selectSpecialization، showSemesters، typeSlug
   (الشيفرة منقولة حرفياً من 03-main.js دون أي تعديل) */


        // ================== تصدير صورة احترافية للإحصائيات ==================
        async function downloadStatsImage() {
            const d = window.__lastStatsData;
            if (!d) { alert('لا توجد بيانات للتصدير، الرجاء الانتظار حتى تحميل الإحصائيات.'); return; }

            const btn = event && event.currentTarget;
            const oldHtml = btn ? btn.innerHTML : '';
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحضير...'; }

            // اختيار المشرف: هل يضيف تذييلاً باسمه؟
            const adminName = 'Mohamed Dah Agove (MDA)';
            const includeAdminFooter = confirm(`هل تريد إضافة تذييل باسم المشرف؟\n\n${adminName}\n\nاضغط "موافق" للإضافة أو "إلغاء" لتنزيل الصورة بدون تذييل.`);

            try {
                // ====== أبعاد منطقية + تكبير ×2 للجودة العالية ======
                const SCALE = 2;
                const W = 1600, H = 2100;
                const extraFooter = includeAdminFooter ? 70 : 0;
                const totalH = H + extraFooter;
                const canvas = document.createElement('canvas');
                canvas.width = W * SCALE; canvas.height = totalH * SCALE;
                const ctx = canvas.getContext('2d');
                ctx.scale(SCALE, SCALE);
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                // خلفية متدرجة
                const bgGrad = ctx.createLinearGradient(0, 0, 0, totalH);
                bgGrad.addColorStop(0, '#f0fdf4');
                bgGrad.addColorStop(1, '#dcfce7');
                ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, totalH);

                // شريط علوي (أصفر)
                const headGrad = ctx.createLinearGradient(0, 0, W, 0);
                headGrad.addColorStop(0, '#0f5132');
                headGrad.addColorStop(1, '#157347');
                ctx.fillStyle = headGrad; ctx.fillRect(0, 0, W, 200);

                // عنوان UNEM ISCAE
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 70px "Segoe UI", Tahoma, Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('UNEM ISCAE', W/2, 90);

                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 38px "Segoe UI", Tahoma, Arial, sans-serif';
                ctx.fillText('تقرير إحصائيات الموقع', W/2, 145);

                ctx.font = '26px "Segoe UI", Tahoma, Arial, sans-serif';
                ctx.fillStyle = '#e6f4ea';
                ctx.fillText('https://unem-iscae.vercel.app/', W/2, 185);

                // معلومات الفترة وتاريخ التوليد
                ctx.textAlign = 'right';
                ctx.fillStyle = '#334155';
                ctx.font = 'bold 28px "Segoe UI", Tahoma, Arial, sans-serif';
                const period = (d.startDate || d.endDate)
                    ? `الفترة: من ${d.startDate || '—'} إلى ${d.endDate || '—'}`
                    : 'الإحصائيات العامة (كل الفترات)';
                ctx.fillText(period, W - 60, 260);

                ctx.textAlign = 'left';
                ctx.font = '24px "Segoe UI", Tahoma, Arial, sans-serif';
                ctx.fillStyle = '#64748b';
                const now = new Date();
                const genDate = now.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
                ctx.fillText('تاريخ التوليد: ' + genDate, 60, 260);

                // دالة رسم بطاقة
                function drawCard(x, y, w, h, title, value, color) {
                    ctx.fillStyle = '#ffffff';
                    ctx.strokeStyle = '#bbf7d0';
                    ctx.lineWidth = 2;
                    roundRect(ctx, x, y, w, h, 20, true, true);
                    ctx.fillStyle = color;
                    roundRect(ctx, x, y, 12, h, 6, true, false);
                    ctx.textAlign = 'center';
                    ctx.fillStyle = color;
                    ctx.font = 'bold 80px "Segoe UI", Tahoma, Arial, sans-serif';
                    ctx.fillText(String(value), x + w/2, y + h/2 + 10);
                    ctx.fillStyle = '#475569';
                    ctx.font = 'bold 26px "Segoe UI", Tahoma, Arial, sans-serif';
                    ctx.fillText(title, x + w/2, y + h - 30);
                }

                function roundRect(ctx, x, y, w, h, r, fill, stroke) {
                    ctx.beginPath();
                    ctx.moveTo(x+r, y);
                    ctx.arcTo(x+w, y, x+w, y+h, r);
                    ctx.arcTo(x+w, y+h, x, y+h, r);
                    ctx.arcTo(x, y+h, x, y, r);
                    ctx.arcTo(x, y, x+w, y, r);
                    ctx.closePath();
                    if (fill) ctx.fill();
                    if (stroke) ctx.stroke();
                }

                // بطاقات المؤشرات الدقيقة
                drawCard(80, 300, 340, 220, 'الزوار الفريدون', d.displayedVisits, '#0f5132');
                drawCard(450, 300, 340, 220, 'زوار النتائج', d.uniqueResults, '#15803d');
                drawCard(820, 300, 340, 220, 'زوار اليوم', d.todayVisitors ?? 0, '#0ea5e9');
                drawCard(1190, 300, 330, 220, 'الأحداث المسجلة', d.totalEvents ?? 0, '#b45309');

                // عنوان قسم الرسوم
                ctx.fillStyle = '#0f5132';
                ctx.textAlign = 'right';
                ctx.font = 'bold 32px "Segoe UI", Tahoma, Arial, sans-serif';
                ctx.fillText('الرسوم البيانية', W - 80, 580);

                // إدراج صور المخططات (بدون "شامل المتكرر")
                const chartIds = [
                    {id: 'dailyVisitsChart', title: 'الزوار الفريدون يومياً'},
                    {id: 'dailyResultsChart', title: 'زوار قسم النتائج يومياً'},
                    {id: 'specChart', title: 'التخصصات'},
                    {id: 'levelChart', title: 'المستويات'}
                ];

                const cw = 700, ch = 480;
                const positions = [
                    [80, 620], [820, 620],
                    [80, 1140], [820, 1140]
                ];

                // إنشاء نسخ نظيفة ومستقلة من المخططات للتصدير فقط.
                // هذا يلغي جذرياً أي tooltip أو hover عالق مثل L1، ولا يعتمد على حالة المخطط المعروض في الشاشة.
                if (document.fonts && document.fonts.ready) {
                    try { await document.fonts.ready; } catch(_) {}
                }

                async function createCleanChartSnapshot(canvasId, width, height) {
                    const srcChart = activeCharts[canvasId];
                    const fallbackCanvas = document.getElementById(canvasId);
                    if (!srcChart || !window.Chart) return { canvas: fallbackCanvas, destroy: function(){} };

                    const ratio = 2;
                    const snapCanvas = document.createElement('canvas');
                    snapCanvas.width = Math.round(width * ratio);
                    snapCanvas.height = Math.round(height * ratio);
                    snapCanvas.style.width = width + 'px';
                    snapCanvas.style.height = height + 'px';

                    const clonedData = {
                        labels: Array.from(srcChart.data.labels || []),
                        datasets: (srcChart.data.datasets || []).map(ds => ({
                            label: ds.label,
                            data: Array.from(ds.data || []),
                            backgroundColor: Array.isArray(ds.backgroundColor) ? Array.from(ds.backgroundColor) : ds.backgroundColor,
                            borderColor: ds.borderColor,
                            borderWidth: ds.borderWidth,
                            fill: ds.fill,
                            tension: ds.tension,
                            pointBackgroundColor: ds.pointBackgroundColor,
                            pointBorderColor: ds.pointBorderColor,
                            pointBorderWidth: ds.pointBorderWidth,
                            pointRadius: ds.pointRadius,
                            pointHoverRadius: 0,
                            hoverOffset: 0
                        }))
                    };

                    const chartType = srcChart.config.type;
                    const isLine = chartType === 'line';
                    const cleanChart = new Chart(snapCanvas.getContext('2d'), {
                        type: chartType,
                        data: clonedData,
                        options: {
                            responsive: false,
                            maintainAspectRatio: false,
                            animation: false,
                            events: [],
                            devicePixelRatio: 1,
                            hover: { mode: null },
                            layout: { padding: 12 },
                            plugins: {
                                legend: { position: 'bottom', labels: { color: '#0f172a', font: { family: 'Tajawal, Segoe UI, Tahoma, Arial, sans-serif', size: 26, weight: 'bold' } } },
                                tooltip: { enabled: false }
                            },
                            scales: isLine ? {
                                y: { beginAtZero: true, ticks: { color: '#0f172a', font: { family: 'Tajawal, Segoe UI, Tahoma, Arial, sans-serif', weight: 'bold', size: 22 } }, grid: { color: 'rgba(15,23,42,0.12)' } },
                                x: { ticks: { color: '#0f172a', font: { family: 'Tajawal, Segoe UI, Tahoma, Arial, sans-serif', weight: 'bold', size: 20 } }, grid: { color: 'rgba(15,23,42,0.08)' } }
                            } : {}
                        }
                    });

                    try { cleanChart.setActiveElements([]); } catch(_) {}
                    if (cleanChart.tooltip) {
                        try { cleanChart.tooltip.setActiveElements([], { x: -9999, y: -9999 }); } catch(_) {}
                    }
                    cleanChart.update('none');
                    cleanChart.draw();
                    await new Promise(r => requestAnimationFrame(r));
                    return { canvas: snapCanvas, destroy: function(){ try { cleanChart.destroy(); } catch(_) {} } };
                }

                for (let i = 0; i < chartIds.length; i++) {
                    const c = document.getElementById(chartIds[i].id);
                    const [px, py] = positions[i];
                    ctx.fillStyle = '#ffffff';
                    ctx.strokeStyle = '#bbf7d0'; ctx.lineWidth = 2;
                    roundRect(ctx, px, py, cw, ch, 20, true, true);
                    ctx.fillStyle = '#0f5132';
                    ctx.textAlign = 'center';
                    ctx.font = 'bold 24px "Segoe UI", Tahoma, Arial, sans-serif';
                    ctx.fillText(chartIds[i].title, px + cw/2, py + 40);
                    if (c) {
                        try {
                            const innerW = cw - 40, innerH = ch - 80;
                            const snap = await createCleanChartSnapshot(chartIds[i].id, innerW, innerH);
                            const sourceCanvas = snap.canvas || c;
                            const cr = sourceCanvas.width / sourceCanvas.height;
                            let dw = innerW, dh = innerW / cr;
                            if (dh > innerH) { dh = innerH; dw = innerH * cr; }
                            const dx = px + (cw - dw)/2;
                            const dy = py + 60 + (innerH - dh)/2;
                            ctx.drawImage(sourceCanvas, dx, dy, dw, dh);
                            snap.destroy();
                        } catch(e) { console.warn('chart draw fail', e); }
                    }
                }

                // تذييل أساسي
                ctx.fillStyle = '#0f5132';
                ctx.fillRect(0, H - 90, W, 90);
                ctx.textAlign = 'center';
                ctx.font = 'bold 28px "Segoe UI", Tahoma, Arial, sans-serif';
                // رسم "UNEM ISCAE • " بالأصفر و URL بالأزرق على نفس السطر
                {
                    const prefix = 'UNEM ISCAE • ';
                    const url = 'https://unem-iscae.vercel.app/';
                    const wPrefix = ctx.measureText(prefix).width;
                    const wUrl = ctx.measureText(url).width;
                    const total = wPrefix + wUrl;
                    const startX = (W - total) / 2;
                    ctx.textAlign = 'left';
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(prefix, startX, H - 50);
                    ctx.fillStyle = '#60a5fa';
                    ctx.fillText(url, startX + wPrefix, H - 50);
                    // تسطير للرابط لتمييزه
                    ctx.strokeStyle = '#60a5fa';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(startX + wPrefix, H - 42);
                    ctx.lineTo(startX + wPrefix + wUrl, H - 42);
                    ctx.stroke();
                    ctx.textAlign = 'center';
                }
                ctx.fillStyle = '#e6f4ea';
                ctx.font = '20px "Segoe UI", Tahoma, Arial, sans-serif';
                ctx.fillText('© ' + now.getFullYear() + ' — جميع الحقوق محفوظة', W/2, H - 20);

                // تذييل المشرف (اختياري)
                if (includeAdminFooter) {
                    ctx.fillStyle = '#0f5132';
                    ctx.fillRect(0, H, W, extraFooter);
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'center';
                    ctx.font = 'bold 26px "Segoe UI", Tahoma, Arial, sans-serif';
                    ctx.fillText('إعداد المشرف: ' + adminName, W/2, H + 44);
                }

                // تنزيل بجودة عالية
                const suffix = (d.startDate || d.endDate)
                    ? `${d.startDate || 'بداية'}_الى_${d.endDate || 'اليوم'}`
                    : 'عامة';
                const link = document.createElement('a');
                link.download = `UNEM_ISCAE_احصائيات_${suffix}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
            } catch(err) {
                console.error(err);
                alert('فشل توليد الصورة: ' + err.message);
            } finally {
                if (btn) { btn.disabled = false; btn.innerHTML = oldHtml; }
            }
        }

        async function adminLogin() {
            const email = document.getElementById('admin-email').value; const pass = document.getElementById('admin-pass').value;
            const errorMsg = document.getElementById('admin-error'); const loginBtn = document.getElementById('admin-login-btn');
            if(!email || !pass) { errorMsg.textContent = "❌ يرجى إدخال البريد وكلمة المرور."; errorMsg.classList.remove('hidden'); return; }
            if(!supabaseClient) { errorMsg.textContent = "❌ تعذر الاتصال بالخادم."; errorMsg.classList.remove('hidden'); return; }
            loginBtn.textContent = "⏳..."; loginBtn.disabled = true;
            const resetBtn = () => { loginBtn.textContent = i18n[currentLang]['btn_login']; loginBtn.disabled = false; };
            try {
                const { error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
                if (error) throw new Error('بيانات الدخول غير صحيحة.');

                // الدور يأتي من قاعدة البيانات — لا يُستنتج من البريد في الواجهة
                const role = await refreshUserRole();
                applyRoleUI();

                if (!hasAdminDashboardAccess()) {
                    await supabaseClient.auth.signOut();
                    currentUserRole = 'user'; isAdminLoggedIn = false;
                    throw new Error('❌ ليس لديك صلاحية للوصول إلى لوحة الإدارة.');
                }
                document.getElementById('admin-login-overlay').classList.add('hidden');
                errorMsg.classList.add('hidden');
                resetBtn();
                document.getElementById('admin-pass').value = '';
                logSupabaseAnalytics('دخول الإدارة', role);
                openAdminDashboard();
            } catch (e) {
                errorMsg.textContent = e.message || '❌ فشل تسجيل الدخول.';
                errorMsg.classList.remove('hidden');
                resetBtn();
            }
        }

        async function adminLogout() {
            try { if (supabaseClient) await supabaseClient.auth.signOut(); }
            catch (e) { console.error(e); }
            currentUserRole = 'user'; currentUserId = null; isAdminLoggedIn = false;
            myPermissions = {};
            syncAdminQuickAccess();
            applyRoleUI();
            closeUploadModal();
            closeAdminDashboard();
        }
        function closeAdminLogin() { document.getElementById('admin-login-overlay').classList.add('hidden'); }

        async function loadActiveAnnouncement() {
            if (!supabaseClient) return;
            try {
                const now = new Date().toISOString();
                const { data } = await supabaseClient
                    .from('announcements').select('*')
                    .lte('start_date', now).gte('end_date', now)
                    .order('created_at', { ascending: false }).limit(1);
                if (!data || !data.length) return;
                const ann = data[0];
                if (String(localStorage.getItem('unem_dismissed_ann')) === String(ann.id)) return;
                _shownAnnId = ann.id;
                _shownAnnUrl = ann.link_url || null;
                document.getElementById('announcement-text').textContent = ann.message;
                const bar = document.getElementById('announcement-bar');
                const hint = document.getElementById('announcement-link-hint');
                if (_shownAnnUrl) {
                    bar.classList.add('clickable');
                    bar.onclick = function(e) { if (!e.target.classList.contains('ann-close-btn')) window.open(_shownAnnUrl, '_blank', 'noopener'); };
                    hint.style.display = 'inline';
                } else {
                    bar.classList.remove('clickable');
                    bar.onclick = null;
                    hint.style.display = 'none';
                }
                bar.classList.add('show');
            } catch(e) {}
        }

        function closeAnnouncementBar() {
            document.getElementById('announcement-bar').classList.remove('show');
            if (_shownAnnId) localStorage.setItem('unem_dismissed_ann', String(_shownAnnId));
        }

        async function loadAnnouncementsAdmin() {
            const container = document.getElementById('ann-list-container');
            if (!supabaseClient || !container) return;
            const loadMsg = document.getElementById('ann-loading-msg');
            try {
                const { data } = await supabaseClient.from('announcements').select('*').order('created_at', { ascending: false });
                if (loadMsg) loadMsg.style.display = 'none';
                if (!data || !data.length) {
                    container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);font-size:0.85rem;font-weight:700;">لا توجد إعلانات حالياً.</p>';
                    return;
                }
                const now = new Date();
                container.innerHTML = data.map(ann => {
                    const active = new Date(ann.start_date) <= now && new Date(ann.end_date) >= now;
                    const badge = active
                        ? '<span class="ann-active-badge">نشط</span>'
                        : '<span class="ann-active-badge ann-expired-badge">منتهي</span>';
                    const s = new Date(ann.start_date).toLocaleString('ar-MA');
                    const e = new Date(ann.end_date).toLocaleString('ar-MA');
                    const linkLine = ann.link_url ? `<div class="ann-link-tag">🔗 ${ann.link_url}</div>` : '';
                    return `<div class="ann-list-item"><div style="flex:1;"><div class="ann-msg">${ann.message}${badge}</div>${linkLine}<div class="ann-dates">من: ${s} — إلى: ${e}</div></div><button class="ann-del-btn" onclick="deleteAnnouncement(${ann.id})">🗑 حذف</button></div>`;
                }).join('');
            } catch(e) { if (loadMsg) loadMsg.textContent = 'حدث خطأ في التحميل.'; }
        }

        async function saveAnnouncement() {
            const msg   = document.getElementById('ann-input-msg').value.trim();
            const url   = document.getElementById('ann-input-url').value.trim();
            const start = document.getElementById('ann-input-start').value;
            const end   = document.getElementById('ann-input-end').value;
            const status = document.getElementById('ann-status');
            if (!msg || !start || !end) { status.textContent = '⚠️ يرجى ملء نص الإعلان والتواريخ.'; status.className = 'status-msg error'; return; }
            if (new Date(start) >= new Date(end)) { status.textContent = '⚠️ تاريخ البداية يجب أن يكون قبل تاريخ الانتهاء.'; status.className = 'status-msg error'; return; }
            if (!supabaseClient) return;
            try {
                const row = { message: msg, start_date: new Date(start).toISOString(), end_date: new Date(end).toISOString() };
                if (url) row.link_url = url;
                const { error } = await supabaseClient.from('announcements').insert([row]);
                if (error) throw error;
                status.textContent = '✅ تم نشر الإعلان بنجاح!'; status.className = 'status-msg success';
                document.getElementById('ann-input-msg').value = '';
                document.getElementById('ann-input-url').value = '';
                document.getElementById('ann-input-start').value = '';
                document.getElementById('ann-input-end').value = '';
                loadAnnouncementsAdmin(); loadActiveAnnouncement();
                setTimeout(() => { status.textContent = ''; }, 4000);
            } catch(e) { status.textContent = '❌ خطأ: ' + (e.message || e); status.className = 'status-msg error'; }
        }

        async function deleteAnnouncement(id) {
            if (!confirm('هل تريد حذف هذا الإعلان؟')) return;
            if (!supabaseClient) return;
            await supabaseClient.from('announcements').delete().eq('id', id);
            loadAnnouncementsAdmin(); loadActiveAnnouncement();
        }

        /* =====================================================================
           إشعارات Push حقيقية — الاشتراك من طرف الزائر + الإرسال من طرف المشرف
           تصل هذه الإشعارات حتى لو كان المتصفح/الموقع مغلقاً (عبر Service Worker)
           ===================================================================== */
        function urlBase64ToUint8Array(base64String) {
            const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
            const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
            const rawData = atob(base64);
            const output = new Uint8Array(rawData.length);
            for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
            return output;
        }

        // Android WebView لا يوفّر Push API أو Notifications API حتى عند توفر Service Worker.
        // نُبقي Web Push الأصلي للمتصفحات المدعومة، ونستخدم الجسر الأصلي لفتح Chrome
        // من داخل تطبيق Android بدل إظهار رسالة دعم غير صحيحة للمستخدم.
        function isAndroidWebView() {
            const ua = navigator.userAgent || '';
            return /Android/i.test(ua) &&
                (/[; ]wv\)/i.test(ua) || /AndroidWebView/i.test(ua) || /UNEMISCAE-Android/i.test(ua));
        }

        function webPushSupported() {
            return 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';
        }

        // أصل غير آمن (content:// أو file:// عند فتح نسخة محفوظة على الجهاز) لا يمكنه تسجيل
        // Service Worker أبداً، فتبقى navigator.serviceWorker.ready معلّقة للأبد دون أي خطأ.
        function unemPushOriginOk() {
            return typeof window.isSecureContext !== 'undefined'
                ? (window.isSecureContext && /^https?:$/.test(location.protocol))
                : /^https?:$/.test(location.protocol);
        }

        /** يعيد تسجيل Service Worker الجاهز، أو null بعد مهلة قصوى — بدل الانتظار للأبد. */
        async function getPushServiceWorker() {
            if (!('serviceWorker' in navigator) || !unemPushOriginOk()) return null;
            try {
                const timeout = new Promise(resolve => setTimeout(() => resolve(null), 8000));
                const ready = navigator.serviceWorker.ready.then(reg => reg).catch(() => null);
                return await Promise.race([ready, timeout]);
            } catch (_) { return null; }
        }

        function nativeFcmSupported() {
            return isAndroidWebView() && window.AndroidNotifications &&
                typeof window.AndroidNotifications.requestNotificationPermission === 'function' &&
                typeof window.AndroidNotifications.isNotificationPermissionGranted === 'function';
        }

        function pushSupported() {
            return webPushSupported() || nativeFcmSupported();
        }

        function openPushInSupportedBrowser() {
            if (!isAndroidWebView() || !window.AndroidNotifications ||
                typeof window.AndroidNotifications.openPushInBrowser !== 'function') return false;
            window.AndroidNotifications.openPushInBrowser();
            return true;
        }

        function setPushIcon(active) {
            const icon = document.getElementById('push-toggle-icon');
            const btn = document.getElementById('push-toggle-btn');
            if (!icon || !btn) return;
            icon.className = active ? 'fas fa-bell' : 'fas fa-bell-slash';
            btn.classList.toggle('active', !!active);
        }

        /** يعكس حالة الاشتراك الفعلية في الأيقونة عند تحميل الصفحة */
        async function initPushUI() {
            const btn = document.getElementById('push-toggle-btn');
            if (!webPushSupported()) {
                // داخل تطبيق Android لا نعرض زر Web Push؛ FCM الأصلي يعمل من النظام.
                if (btn) btn.style.display = 'none';
                return;
            }
            try {
                const reg = await getPushServiceWorker();
                if (!reg) { setPushIcon(false); return; }
                const sub = await reg.pushManager.getSubscription();
                const active = !!sub && Notification.permission === 'granted';
                setPushIcon(active);
                // إعادة مزامنة تلقائية: من فعّل الإشعارات سابقاً ولم يُسجَّل في القاعدة يُضاف الآن
                if (active) {
                    const saved = await savePushSubscriptionToDb(sub);
                    if (!saved.ok) console.warn('push sync failed:', saved.message);
                }
            } catch (e) { setPushIcon(false); }
        }

        async function subscribeToPush() {
            if (!webPushSupported()) return false;
            if (!unemPushOriginOk()) {
                throw new Error('الإشعارات تعمل فقط عند فتح المنصة عبر رابطها الرسمي (https)، لا من نسخة محفوظة على الجهاز.');
            }
            const reg = await getPushServiceWorker();
            if (!reg) {
                throw new Error('تعذّر تجهيز خدمة الإشعارات في هذا المتصفح. أعد تحميل الصفحة من الرابط الرسمي ثم حاول مجدداً.');
            }
            const res = await fetch(unemApi('/api/public/push/vapid-key'));
            const data = await res.json().catch(() => ({}));
            if (!data || !data.publicKey) {
                alert('❌ الإشعارات غير مفعّلة على الخادم حالياً.');
                return false;
            }
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') return false;

            let sub = await reg.pushManager.getSubscription();
            if (!sub) {
                sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(data.publicKey),
                });
            }
            const saved = await savePushSubscriptionToDb(sub);
            if (!saved.ok) {
                alert('❌ تعذّر تسجيل جهازك في قاعدة بيانات الإشعارات: ' + saved.message);
                return false;
            }
            localStorage.setItem('unem_push_enabled', '1');
            return true;
        }

        /** يحفظ اشتراك المتصفح في قاعدة البيانات (مع إظهار الخطأ بدل تجاهله) */
        async function savePushSubscriptionToDb(sub) {
            if (!supabaseClient) {
                return { ok: false, message: 'قاعدة البيانات غير متصلة.' };
            }

            try {
                const json = sub.toJSON();
                const endpoint = json.endpoint;
                const p256dh = json.keys?.p256dh;
                const auth = json.keys?.auth;
                const userAgent = navigator.userAgent;

                if (!endpoint || !p256dh || !auth) {
                    return { ok: false, message: 'بيانات اشتراك الإشعارات غير مكتملة.' };
                }

                // حفظ الاشتراك عبر RPC آمنة بدل الكتابة المباشرة إلى الجدول.
                // هذا يعمل للزائر anon وللمستخدم authenticated.
                const { data, error } = await supabaseClient.rpc(
                    'save_push_subscription',
                    {
                        p_endpoint: endpoint,
                        p_p256dh: p256dh,
                        p_auth: auth,
                        p_user_agent: userAgent
                    }
                );

                if (error) {
                    console.error('save_push_subscription RPC error:', error);
                    return { ok: false, message: error.message || 'تعذر حفظ اشتراك الإشعارات.' };
                }

                return { ok: true, id: data };
            } catch (e) {
                console.error('Push subscription save error:', e);
                return { ok: false, message: (e && e.message) || String(e) };
            }
        }

        async function unsubscribeFromPush() {
            try {
                const reg = await getPushServiceWorker();
                const sub = reg ? await reg.pushManager.getSubscription() : null;

                if (sub) {
                    const endpoint = sub.endpoint;

                    // إلغاء اشتراك المتصفح أولاً.
                    await sub.unsubscribe();

                    // حذف السجل عبر RPC بدل DELETE المباشر الذي تمنعه RLS.
                    if (supabaseClient && endpoint) {
                        const { error } = await supabaseClient.rpc(
                            'remove_push_subscription',
                            { p_endpoint: endpoint }
                        );

                        if (error) {
                            console.error('remove_push_subscription RPC error:', error);
                        }
                    }
                }
            } catch (e) {
                console.error('Push unsubscribe error:', e);
            }

            localStorage.setItem('unem_push_enabled', '0');
        }

        async function togglePushNotifications() {
            // لا يُستخدم هذا الزر داخل Android WebView؛ إشعارات التطبيق تُدار عبر FCM الأصلي.
            if (!webPushSupported()) return;
            const btn = document.getElementById('push-toggle-btn');
            if (btn) btn.disabled = true;
            try {
                const reg = await getPushServiceWorker();
                const existing = reg ? await reg.pushManager.getSubscription() : null;
                if (existing && Notification.permission === 'granted') {
                    await unsubscribeFromPush();
                    setPushIcon(false);
                } else if (Notification.permission === 'denied') {
                    alert('🔕 الإشعارات محظورة من إعدادات المتصفح. فعّلها من إعدادات الموقع في المتصفح ثم أعد المحاولة.');
                } else {
                    const ok = await subscribeToPush();
                    setPushIcon(ok);
                    if (ok) alert('🔔 تم تفعيل الإشعارات! ستصلك التنبيهات الجديدة حتى خارج الموقع.');
                }
            } catch (e) {
                console.error(e);
                alert('❌ تعذر تفعيل الإشعارات: ' + (e.message || e));
            } finally { if (btn) btn.disabled = false; }
        }

        /** لوحة المشرف: إرسال إشعار حقيقي لجميع المشتركين */
        async function sendPushNotificationAdmin() {
            if (!hasPermission('send_notifications')) return;
            const titleEl = document.getElementById('push-input-title');
            const bodyEl = document.getElementById('push-input-body');
            const urlEl = document.getElementById('push-input-url');
            const status = document.getElementById('push-status');
            const btn = document.getElementById('push-send-btn');
            const title = titleEl.value.trim();
            const body = bodyEl.value.trim();
            const url = urlEl.value.trim();

            if (!title || !body) {
                status.textContent = '❌ العنوان والنص مطلوبان.';
                status.className = 'status-msg error';
                return;
            }

            btn.disabled = true;
            status.textContent = '⏳ جاري الإرسال...';
            status.className = 'status-msg';
            try {
                const token = await getAccessToken();
                if (!token) throw new Error('انتهت الجلسة، سجّل الدخول مجدداً.');
                const res = await fetch(unemApi('/api/public/push/send'), {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ title, body, url }),
                });
                const out = await res.json().catch(() => null);
                if (!res.ok) throw new Error((out && out.error) || 'فشل إرسال الإشعار.');

                status.textContent = `✅ النتيجة: ${out.delivered || 0} نجح، ${out.expired || 0} اشتراك منتهٍ/محذوف، ${out.failed || 0} فشل تقني من أصل ${out.total || 0} (ويب: ${out.web_delivered || 0} ناجح، ${out.web_expired || 0} منتهٍ؛ Android/FCM: ${out.fcm_delivered || 0} ناجح، ${out.fcm_expired || 0} منتهٍ).` +
                    ((out.expired || 0) > 0 ? ' ℹ️ الاشتراكات المنتهية حُذفت تلقائياً من القاعدة، وسيُجدَّد اشتراك أصحابها تلقائياً عند فتحهم الموقع مرة أخرى.' : '');
                status.className = 'status-msg success';
                titleEl.value = ''; bodyEl.value = ''; urlEl.value = '';
                loadPushHistoryAdmin();
                loadPushActiveDeviceCount();
            } catch (e) {
                status.textContent = '❌ خطأ: ' + (e.message || e);
                status.className = 'status-msg error';
            } finally { btn.disabled = false; }
        }

        /**
         * يعرض أعداد اشتراكات Web Push وFCM الأصلية المسجلة حالياً.
         * لا يغيّر هذا القسم نظام الإشعارات؛ يقرأ العددين فقط للمشرف.
         */
        /**
         * يحذف اشتراكات Web Push التي لم تُحدّث منذ 90 يوماً.
         * الاشتراكات التي يرفضها مزود الإشعارات تُحذف تلقائياً من الخادم عند الإرسال.
         */
        async function cleanupExpiredPushSubscriptions() {
            if (!hasPermission('send_notifications') || !supabaseClient) return;
            const status = document.getElementById('push-status');
            try {
                if (status) { status.textContent = '⏳ جاري تنظيف الاشتراكات غير النشطة...'; status.className = 'status-msg'; }
                const { data, error } = await supabaseClient.rpc('cleanup_expired_push_subscriptions', { p_inactive_days: 90 });
                if (error) throw error;
                const removed = Number(data || 0);
                if (status) { status.textContent = `✅ تم حذف ${removed} اشتراك غير نشط (أكثر من 90 يوماً).`; status.className = 'status-msg success'; }
                loadPushActiveDeviceCount();
            } catch (e) {
                console.error('cleanupExpiredPushSubscriptions', e);
                if (status) { status.textContent = '❌ تعذر تنظيف الاشتراكات: ' + (e.message || e); status.className = 'status-msg error'; }
            }
        }
        async function loadPushActiveDeviceCount() {
            const webEl = document.getElementById('push-active-device-count');
            const fcmEl = document.getElementById('push-active-fcm-count');
            if ((!webEl && !fcmEl) || !supabaseClient || !hasPermission('send_notifications')) return;
            if (webEl) webEl.textContent = '…';
            if (fcmEl) fcmEl.textContent = '…';

            try {
                const { count, error } = await supabaseClient
                    .from('push_subscriptions')
                    .select('id', { count: 'exact', head: true });
                if (error) throw error;
                if (webEl) webEl.textContent = Number.isFinite(count) ? String(count) : '0';
            } catch (e) {
                console.error('loadPushActiveDeviceCount:web', e);
                if (webEl) webEl.textContent = '—';
            }

            try {
                const { count, error } = await supabaseClient
                    .from('fcm_tokens')
                    .select('id', { count: 'exact', head: true })
                    .eq('platform', 'android')
                    .eq('app_id', 'mr.unem.iscae');
                if (error) throw error;
                if (fcmEl) fcmEl.textContent = Number.isFinite(count) ? String(count) : '0';
            } catch (e) {
                console.error('loadPushActiveDeviceCount:fcm', e);
                if (fcmEl) fcmEl.textContent = '—';
            }
        }

        async function loadPushHistoryAdmin() {
            const container = document.getElementById('push-list-container');
            if (!supabaseClient || !container) return;
            const loadMsg = document.getElementById('push-loading-msg');
            try {
                const { data } = await supabaseClient
                    .from('push_notifications_log')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(20);
                if (loadMsg) loadMsg.style.display = 'none';
                if (!data || !data.length) {
                    container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);font-size:0.85rem;font-weight:700;">لا توجد إشعارات مرسلة بعد.</p>';
                    return;
                }
                container.innerHTML = data.map(n => {
                    const d = new Date(n.created_at).toLocaleString('ar-MA');
                    return `<div class="push-list-item">
                        <div class="push-title">${n.title}</div>
                        <div class="push-body">${n.body}</div>
                        <div class="push-meta">
                            <span>${d}</span>
                            <span class="ok">✔ ${n.delivered || 0} ناجح</span>
                            <span style="color:#b7791f">⚠ ${n.expired || 0} منتهٍ</span>
                            <span class="fail">✖ ${n.failed || 0} فشل تقني</span>
                            <span>من أصل ${n.recipients || 0}</span>
                        </div>
                    </div>`;
                }).join('');
            } catch (e) { if (loadMsg) loadMsg.textContent = 'حدث خطأ في التحميل.'; }
        }


        function hideAll() { document.querySelectorAll('.section-box').forEach(el => el.classList.add('hidden')); }
        
        function goBackToMainMenu() { hideAll(); document.getElementById('main-menu').classList.remove('hidden'); if (typeof window.applyUnemMasterVisibility === 'function') window.applyUnemMasterVisibility(); }
        function goBackToSpecialization() { hideAll(); document.getElementById('specialization-selection').classList.remove('hidden'); if (typeof window.applyUnemMasterVisibility === 'function') window.applyUnemMasterVisibility(); }
        function goBackToLevels() { hideAll(); document.getElementById('level-selection').classList.remove('hidden'); }
        function goBackToSemesters() { hideAll(); if(currentLevel) { document.getElementById('semesters-container').classList.remove('hidden'); } else { document.getElementById('level-selection').classList.remove('hidden'); } }
        function goBackToSubjects() { hideAll(); document.getElementById('subjects-container').classList.remove('hidden'); }
        function goBackToCategories() { hideAll(); document.getElementById('category-selection-container').classList.remove('hidden'); }

        function showStudyCycleSelection() {
            if (typeof window.unemMasterVisible === 'function' && !window.unemMasterVisible()) { showSpecializationSelection('licence'); return; }
            const masterCard = document.querySelector('.master-cycle-card');
            if (masterCard && getComputedStyle(masterCard).display === 'none') { showSpecializationSelection('licence'); return; }
            hideAll(); document.getElementById('study-cycle-selection').classList.remove('hidden');
            if (typeof window.applyUnemMasterVisibility === 'function') window.applyUnemMasterVisibility();
        }
        function goBackToStudyCycleSelection() {
            if (typeof window.unemMasterVisible === 'function' && !window.unemMasterVisible()) { goBackToMainMenu(); return; }
            hideAll(); document.getElementById('study-cycle-selection').classList.remove('hidden');
            if (typeof window.applyUnemMasterVisibility === 'function') window.applyUnemMasterVisibility();
        }
        function showSpecializationSelection(cycle) {
            if (cycle === 'master' && typeof window.unemMasterVisible === 'function' && !window.unemMasterVisible()) { cycle = 'licence'; }
            hideAll();
            const section=document.getElementById('specialization-selection');
            if(!section) return;
            section.classList.remove('hidden');
            const wanted=cycle==='master'?'master':'licence'; window.__unemSpecCycle=wanted;
            section.querySelectorAll('.specialization-card').forEach(card=>{
                card.style.display=(card.dataset.cycle===wanted)?'flex':'none';
            });
            if (typeof window.applyUnemMasterVisibility === 'function') window.applyUnemMasterVisibility();
        }
        
        function selectSpecialization(spec) { 
            if(typeof gtag === 'function') gtag('event', 'select_specialization', { 'specialization': spec });
            logSupabaseAnalytics('دخول تخصص', spec.toUpperCase()); 
            
            currentSpecialization = spec; currentBranch = branchMap[spec] || 'main'; allFiles =[]; hideAll(); document.getElementById('level-selection').classList.remove('hidden'); const regularLevels=document.querySelector('#level-selection > .semesters-grid:not(#master-level-options)'); const masterLevels=document.getElementById('master-level-options'); const isMaster=String(spec).startsWith('master_'); if(regularLevels) regularLevels.classList.toggle('hidden', isMaster); if(masterLevels) masterLevels.classList.toggle('hidden', !isMaster); fetchFilesFromGitHub(currentBranch); 
        }

        function showSemesters(level) {
            logSupabaseAnalytics('دخول مستوى', level.toUpperCase());
            currentLevel = level; hideAll(); document.getElementById('semesters-container').classList.remove('hidden');
            const grid = document.getElementById('semesters-grid-view'); grid.innerHTML = ''; 
            let semesters = (level === 'l1' || level === 'm1') ?['s1', 's2'] : (level === 'l2' || level === 'm2') ?['s3', 's4'] :['s5', 's6'];
            semesters.forEach(sem => {
                const div = document.createElement('div'); div.className = 'semester-card';
                div.innerHTML = `<div class="icon-box"><i class="fas fa-layer-group"></i></div><h3>Semestre ${sem.replace('s','')}</h3>`;
                div.onclick = () => showSubjects(sem); grid.appendChild(div);
            });
            // مجموعات WhatsApp أصبحت قسماً مستقلاً من القائمة الرئيسية، ولا تظهر داخل أرشيف المواد أو صفحة الفصول.
        }

        function typeSlug(value) {
            return String(value || '').toLowerCase().normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '');
        }