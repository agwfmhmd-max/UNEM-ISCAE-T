/* ===== تقسيم 03-main.js — دوال =====
   يُحمَّل بعد الملفات التي تسبقه وقبل التي تليه (الترتيب محدد في src/legacy/app.html).
   الدوال: unemSafeAuthStorage، unemApi، storageSpecializationFor، isMasterSpecialization، storageLevelFor، masterSubjectSpecFor، effectiveUploadSpec، isMasterUploadContext، subjectsForUpload، isMasterCycle، masterStorageCode، storageSubjectCode، isArchiveLikeSubject، documentCodeVariants، isExplicitMasterGithubFile، isDocumentInCurrentScope، hasAdminDashboardAccess، syncAdminQuickAccess، getAccessToken، refreshUserRole، applyRoleUI، getUnemVisitorId، insertAnalyticsRow، logSupabaseAnalytics، applyAnalyticsFilter، openAnalyticsDashboard، renderTopFilesTable، renderAnalyticsChart، openTopFilesPage، closeTopFilesPage، loadTopFilesPage، closeAnalyticsDashboard، closeAnalyticsDashboard
   (الشيفرة منقولة حرفياً من 03-main.js دون أي تعديل) */
 
        /* تخزين آمن لجلسة Supabase: إن كان التخزين المحلي ممتلئاً (بسبب كاش ملفات GitHub القديم)
           يُفرَّغ الكاش غير الضروري أولاً بدل أن يفشل تسجيل الدخول برسالة "exceeded the quota". */
        function unemSafeAuthStorage() {
            function purgeNonEssentialCache() {
                try {
                    Object.keys(localStorage)
                        .filter(k => /^github_cache_/.test(k))
                        .forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
                } catch (_) {}
            }
            return {
                getItem(key) {
                    try { const v = localStorage.getItem(key); if (v !== null) return v; } catch (_) {}
                    try { return sessionStorage.getItem(key); } catch (_) { return null; }
                },
                setItem(key, value) {
                    try { localStorage.setItem(key, value); try { sessionStorage.removeItem(key); } catch (_) {} return; } catch (e1) {}
                    purgeNonEssentialCache();
                    try { localStorage.setItem(key, value); try { sessionStorage.removeItem(key); } catch (_) {} return; } catch (e2) {}
                    // ملاذ أخير: نُبقي الجلسة في sessionStorage حتى لا يفشل تسجيل الدخول كليّاً.
                    try { sessionStorage.setItem(key, value); } catch (_) {}
                },
                removeItem(key) {
                    try { localStorage.removeItem(key); } catch (_) {}
                    try { sessionStorage.removeItem(key); } catch (_) {}
                }
            };
        }
        function unemApi(path) {
            const clean = String(path || '').startsWith('/') ? String(path) : '/' + String(path || '');
            const proto = String(window.location?.protocol || '');
            const origin = String(window.location?.origin || '');
            if (proto === 'http:' || proto === 'https:') return origin + clean;
            return UNEM_PRODUCTION_ORIGIN + clean;
        }
        // مفاتيح الخادم القديمة تبقى متوافقة مع فصل ملفات الماستر بالمستوى M1/M2.
        function storageSpecializationFor(value) { const key=String(value || '').toUpperCase(); return key==='MASTER_FC' ? 'FC' : key==='MASTER_IG' ? 'IG' : key; }
        function isMasterSpecialization(value) { return /^MASTER_(FC|IG)$/i.test(String(value || '')); }
        // خادم الرفع القديم يقبل L1/L2/L3؛ نحافظ على M1/M2 في الواجهة ونحوّلهما داخلياً فقط.
        function storageLevelFor(spec, level) { const s=String(spec || '').toUpperCase(), l=String(level || '').toUpperCase(); if(/^MASTER_/.test(s)) return l==='M1' ? 'L1' : l==='M2' ? 'L2' : l; return l; }
        function masterSubjectSpecFor(spec, subject) { const s=String(spec || '').toUpperCase(), name=String(subject || ''); if(s==='FC' && subjectsFor('MASTER_FC','S1').concat(subjectsFor('MASTER_FC','S2'),subjectsFor('MASTER_FC','S3'),subjectsFor('MASTER_FC','S4')).includes(name)) return 'MASTER_FC'; if(s==='IG' && subjectsFor('MASTER_IG','S1').concat(subjectsFor('MASTER_IG','S2'),subjectsFor('MASTER_IG','S3'),subjectsFor('MASTER_IG','S4')).includes(name)) return 'MASTER_IG'; return s; }
        function effectiveUploadSpec(spec, level, subject) { const s=String(spec || '').toUpperCase(), l=String(level || '').toUpperCase(); if(isMasterSpecialization(s)) return s; if((l==='M1' || l==='M2') && (s==='FC' || s==='IG')) return 'MASTER_' + s; return masterSubjectSpecFor(s, subject); }
        function isMasterUploadContext(spec, level, subject) { const s=String(spec || '').toUpperCase(), l=String(level || '').toUpperCase(); return isMasterSpecialization(s) || l==='M1' || l==='M2' || (s==='FC' && subjectsFor('MASTER_FC','S1').concat(subjectsFor('MASTER_FC','S2'),subjectsFor('MASTER_FC','S3'),subjectsFor('MASTER_FC','S4')).includes(String(subject || ''))) || (s==='IG' && subjectsFor('MASTER_IG','S1').concat(subjectsFor('MASTER_IG','S2'),subjectsFor('MASTER_IG','S3'),subjectsFor('MASTER_IG','S4')).includes(String(subject || ''))); }
        function subjectsForUpload(spec, level, semester) { return subjectsFor(effectiveUploadSpec(spec, level), semester); }
        function isMasterCycle(spec, level) { return isMasterSpecialization(spec) || /^M[12]$/i.test(String(level || '')); }
        function masterStorageCode(name) { return ('m_' + getSafeSubjectCode(name)).slice(0, 60); }
        function storageSubjectCode(spec, level, name) { return isMasterCycle(spec, level) ? masterStorageCode(name) : getSafeSubjectCode(name); }
        function isArchiveLikeSubject(name) { return /^archive\s*s\d/i.test(String(name || '').trim()); }
        /** رموز البحث عن ملفات مادة: للماستر الرمز الجديد + (توافقاً مع الملفات القديمة) الرمز القديم لمواد FC الثابتة غير الأرشيف فقط */
        function documentCodeVariants(spec, level, name) {
            if (!isMasterCycle(spec, level)) return subjectCodeVariants(name);
            // الماستر لا يستخدم أبداً رمز مادة الليسانس؛ هذا هو الحاجز الأساسي ضد التداخل.
            const out = [masterStorageCode(name)];
            const hard = subjectsData[String(spec || '').toUpperCase()] || {};
            const isHardcoded = Object.keys(hard).some(k => (hard[k] || []).includes(name));
            if (isHardcoded && !isArchiveLikeSubject(name)) subjectCodeVariants(name).forEach(c => { if (!out.includes(c)) out.push(c); });
            return out;
        }

        // ملفات GitHub القديمة لا تحمل حقول الدورة؛ لا نسمح بها في الماستر
        // إلا إذا كان مسارها نفسه يعلن صراحةً أنها Master/M1/M2.
        function isExplicitMasterGithubFile(file) {
            const path = normalizeText((file && (file.path || file.name)) || '');
            return /(^|[\/ _-])(master|m[12])([\/ _-]|$)/i.test(path);
        }

        function isDocumentInCurrentScope(doc) {
            if (!doc) return false;
            const master = isMasterCycle(currentSpecialization, currentLevel);
            const code = String(doc.subject_code || '').toLowerCase();
            const wanted = documentCodeVariants(currentSpecialization, currentLevel, currentSubjectName).map(String).map(v => v.toLowerCase());
            if (master) {
                if (doc.source === 'github' && !isExplicitMasterGithubFile(doc)) return false;
                return code ? code === String(masterStorageCode(currentSubjectName)).toLowerCase() : doc.source === 'github' && isExplicitMasterGithubFile(doc);
            }
            if (/^m_/.test(code)) return false;
            if (!code || wanted.includes(code)) return true;
            // مادة مشتركة بين تخصصات محددة: ملفات بقية أعضاء المجموعة مسموحة أيضاً
            const shared = sharedTargetsFor(currentSpecialization, currentLevel, currentSemester, currentSubjectName);
            return shared.some(t => t.codes.includes(code));
        }
        function hasAdminDashboardAccess(){ return canUpload() || Object.values(myPermissions || {}).some(value => value === true); }
        /** زر إدارة ثابت: يظهر لمن مُنح صلاحية إدارة واحدة على الأقل. */
        function syncAdminQuickAccess(){
            const btn=document.getElementById('admin-quick-access');
            if(!btn) return;
            btn.classList.toggle('visible', hasAdminDashboardAccess());
        }

        async function getAccessToken() {
            if (!supabaseClient) return null;
            const { data } = await supabaseClient.auth.getSession();
            return data && data.session ? data.session.access_token : null;
        }

        /** يقرأ الدور الحقيقي من قاعدة البيانات (RPC محمي بـ RLS) */
        async function refreshUserRole() {
            currentUserRole = 'user'; currentUserId = null; isAdminLoggedIn = false; myPermissions = {};
            syncAdminQuickAccess();
            if (!supabaseClient) return 'user';
            const { data: sessionData } = await supabaseClient.auth.getSession();
            const session = sessionData ? sessionData.session : null;
            if (!session) return 'user';
            currentUserId = session.user.id;
            const { data, error } = await supabaseClient.rpc('get_my_role');
            if (error) {
                console.error('get_my_role', error);
                throw new Error('تعذر قراءة صلاحيات الحساب من قاعدة البيانات. تأكد من تنفيذ ملف SQL.');
            }
            currentUserRole = (data === 'admin' || data === 'uploader') ? data : 'user';
            isAdminLoggedIn = canUpload();
            syncAdminQuickAccess();
            await loadMyPermissions();
            return currentUserRole;
        }

        /** يُظهر/يُخفي أدوات الإدارة الحساسة حسب الدور */
        function applyRoleUI() {
            const badge = document.getElementById('role-badge');
            if (badge) {
                // لا نعرض أي شارة تكشف نوع الحساب (مشرف عام / رافع ملفات)
                badge.textContent = '';
                badge.style.display = 'none';
            }
            const requirements = {
                'admin-only-analytics': 'view_analytics',
                'ann-admin-section': 'manage_announcements',
                'push-admin-section': 'send_notifications',
                'types-admin-section': 'manage_document_types',
                'admin-online-public-setting': 'manage_platform_settings',
                'admin-home-stats-setting': 'manage_platform_settings',
                'admin-onboarding-prompts-setting': 'manage_platform_settings'
            };
            Object.entries(requirements).forEach(([id, permission]) => {
                const el = document.getElementById(id);
                if (el) el.style.display = hasPermission(permission) ? '' : 'none';
            });
        }

        // ================== نظام إحصائيات الدقيق والفريد للمتصفح ==================
        // ================== نظام إحصائيات الدقيق والفريد للمتصفح ==================
        // معرّف ثابت للجهاز يُستخدم لاحتساب الزوار الفريدين بدقة (لا يعتمد على الحقول النصية)
        function getUnemVisitorId() {
            try {
                let v = localStorage.getItem('unem_visitor_id');
                if (!v) {
                    v = (window.crypto && crypto.randomUUID)
                        ? crypto.randomUUID()
                        : 'v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
                    localStorage.setItem('unem_visitor_id', v);
                }
                return v;
            } catch (e) {
                return 'anon-' + Math.random().toString(36).slice(2, 10);
            }
        }

        // إدراج آمن: إن لم يكن عمود visitor_id موجوداً بعد في قاعدة البيانات نعيد المحاولة بدونه
        async function insertAnalyticsRow(client, row) {
            if (!client) return;
            try {
                const { error } = await client.from('analytics').insert([{ ...row, visitor_id: getUnemVisitorId() }]);
                if (error) throw error;
            } catch (e) {
                try { await client.from('analytics').insert([row]); } catch (e2) {}
            }
        }

        async function logSupabaseAnalytics(actionType, actionDetail) {
            if (!supabaseClient) return;
            
            try {
                // ===== ضمان تسجيل "زيارة الموقع" قبل أي حدث آخر =====
                // إذا كان الحدث ليس زيارة موقع، ولم يُسجَّل للمستخدم زيارة بعد،
                // نسجّل زيارة فريدة أولاً حتى لا يتجاوز عدد النتائج عدد الزيارات.
                if (actionType !== 'زيارة الموقع' && !localStorage.getItem('unem_has_visited')) {
                    localStorage.setItem('unem_has_visited', 'true');
                    await insertAnalyticsRow(supabaseClient, {
                        action_type: 'زيارة الموقع',
                        action_detail: 'تلقائي - ' + (actionDetail || actionType)
                    });
                }

                let isFirstTime = false;

                if (actionType === 'زيارة الموقع') {
                    if (!localStorage.getItem('unem_has_visited')) {
                        localStorage.setItem('unem_has_visited', 'true');
                        isFirstTime = true;
                    }
                } 
                else if (actionType === 'دخول تخصص') {
                    let loggedSpecs = JSON.parse(localStorage.getItem('unem_logged_specs') || '[]');
                    if (!loggedSpecs.includes(actionDetail)) {
                        loggedSpecs.push(actionDetail);
                        localStorage.setItem('unem_logged_specs', JSON.stringify(loggedSpecs));
                        isFirstTime = true;
                    }
                }
                else if (actionType === 'دخول مستوى') {
                    let loggedLevels = JSON.parse(localStorage.getItem('unem_logged_levels') || '[]');
                    if (!loggedLevels.includes(actionDetail)) {
                        loggedLevels.push(actionDetail);
                        localStorage.setItem('unem_logged_levels', JSON.stringify(loggedLevels));
                        isFirstTime = true;
                    }
                }
                else if (actionType === 'دخول قسم') {
                    let loggedSections = JSON.parse(localStorage.getItem('unem_logged_sections') || '[]');
                    if (!loggedSections.includes(actionDetail)) {
                        loggedSections.push(actionDetail);
                        localStorage.setItem('unem_logged_sections', JSON.stringify(loggedSections));
                        isFirstTime = true;
                    }
                }

                // أحداث الملفات يجب أن تُسجّل دائمًا بنفس النوع حتى يمكن عدّ كل فتح/تحميل بدقة.
                // لا نضع عليها لاحقة "(متكرر)" لأن كل عملية فتح أو تحميل هي تفاعل مستقل.
                const isFileInteraction = actionType === 'فتح ملف' || actionType === 'تحميل ملف';
                let finalActionType = isFileInteraction
                    ? actionType
                    : (isFirstTime ? actionType : actionType + ' (متكرر)');

                await insertAnalyticsRow(supabaseClient, { action_type: finalActionType, action_detail: actionDetail });
            } catch (e) {}
        }

        function applyAnalyticsFilter() {
            const startDate = document.getElementById('analytics-start-date').value;
            const endDate = document.getElementById('analytics-end-date').value;
            openAnalyticsDashboard(startDate, endDate);
        }

        async function openAnalyticsDashboard(startDate = null, endDate = null) {
            if(!hasPermission('view_analytics')){
                alert('❌ ليست لديك الصلاحية لعرض الإحصائيات.');
                return;
            }
            document.getElementById('upload-modal-overlay').classList.add('hidden');
            document.getElementById('analytics-overlay').classList.remove('hidden');
            const errDiv = document.getElementById('analytics-error');
            errDiv.classList.add('hidden');

            if (!supabaseClient) { 
                errDiv.textContent = "لم يتم الاتصال بقاعدة البيانات!"; 
                errDiv.classList.remove('hidden'); 
                return; 
            }

            try {
                if (!startDate && !endDate) {
                    document.getElementById('analytics-start-date').value = '';
                    document.getElementById('analytics-end-date').value = '';
                }

                ['stat-visits','stat-results','stat-today','stat-downloads','stat-searches','stat-events'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = '...';
                });

                let allData = [];
                let from = 0;
                const batchSize = 1000; 
                let keepFetching = true;

                while (keepFetching) {
                    let query = supabaseClient
                        .from('analytics')
                        .select('*')
                        .order('created_at', { ascending: false });

                    if (startDate) query = query.gte('created_at', startDate + 'T00:00:00.000Z');
                    if (endDate) query = query.lte('created_at', endDate + 'T23:59:59.999Z');

                    query = query.range(from, from + batchSize - 1);

                    const { data, error } = await query;
                    if (error) throw error;

                    allData = allData.concat(data);

                    if (data.length < batchSize) {
                        keepFetching = false;
                    } else {
                        from += batchSize;
                    }
                }

                /* ================= احتساب دقيق ومستقر =================
                   القاعدة: كل زائر يُحسب مرة واحدة عبر معرّف جهازه (visitor_id).
                   الصفوف القديمة بلا معرّف: تُحسب مرة واحدة عبر معرّف الصف غير المتكرر.
                   كل مجموعة قسم هي مجموعة جزئية من مجموعة الزوار الكلية،
                   لذلك يستحيل أن يتجاوز أي قسم إجمالي الزوار.
                ======================================================= */
                const visitorKey = (row) => {
                    if (row.visitor_id) return 'v:' + row.visitor_id;
                    if (!String(row.action_type || '').includes('(متكرر)')) return 'l:' + row.id;
                    return null; // صف متكرر قديم: لا يُحتسب في التفرّد
                };
                const baseType = (row) => String(row.action_type || '').replace(' (متكرر)', '').trim();

                const allVisitors = new Set();
                const resultsVisitors = new Set();
                const todayVisitors = new Set();
                const dailyVisitorSets = {};
                const dailyResultSets = {};
                const specVisitorSets = {};
                const levelVisitorSets = {};
                const fileCounts = {};
                let downloadEvents = 0;
                let searchEvents = 0;

                const todayStr = new Date().toISOString().split('T')[0];
                const addTo = (store, key, visitor) => {
                    if (!key) return;
                    if (!store[key]) store[key] = new Set();
                    if (visitor) store[key].add(visitor);
                };

                allData.forEach(row => {
                    const dateStr = String(row.created_at).split('T')[0];
                    const type = baseType(row);
                    const key = visitorKey(row);

                    if (key) {
                        allVisitors.add(key);
                        addTo(dailyVisitorSets, dateStr, key);
                        if (dateStr === todayStr) todayVisitors.add(key);
                    }

                    if (type === 'دخول قسم' && row.action_detail === 'النتائج') {
                        if (key) { resultsVisitors.add(key); addTo(dailyResultSets, dateStr, key); }
                    }
                    if (type === 'دخول تخصص' && row.action_detail) addTo(specVisitorSets, row.action_detail, key);
                    if (type === 'دخول مستوى' && row.action_detail) addTo(levelVisitorSets, row.action_detail, key);
                    if (type === 'تحميل ملف' || type === 'فتح ملف') {
                        downloadEvents++;
                        const name = row.action_detail || 'ملف غير معروف';
                        fileCounts[name] = (fileCounts[name] || 0) + 1;
                    }
                    if (type === 'بحث') searchEvents++;
                });

                const setsToCounts = (store, sortKeys) => {
                    const keys = Object.keys(store);
                    keys.sort(sortKeys ? undefined : (a, b) => store[b].size - store[a].size);
                    if (sortKeys) keys.sort();
                    const out = {};
                    keys.forEach(k => { out[k] = store[k].size; });
                    return out;
                };

                const displayedVisits = allVisitors.size;
                const uniqueResults = Math.min(resultsVisitors.size, displayedVisits);
                const sortedDailyVisits = setsToCounts(dailyVisitorSets, true);
                const sortedDailyResults = setsToCounts(dailyResultSets, true);
                const specCountsTotal = setsToCounts(specVisitorSets);
                const levelCountsTotal = setsToCounts(levelVisitorSets);

                document.getElementById('stat-visits').textContent = displayedVisits.toLocaleString('en-US');
                document.getElementById('stat-results').textContent = uniqueResults.toLocaleString('en-US');
                document.getElementById('stat-today').textContent = todayVisitors.size.toLocaleString('en-US');
                document.getElementById('stat-downloads').textContent = downloadEvents.toLocaleString('en-US');
                document.getElementById('stat-searches').textContent = searchEvents.toLocaleString('en-US');
                document.getElementById('stat-events').textContent = allData.length.toLocaleString('en-US');

                // جدول أكثر الملفات تفاعلاً
                const topFiles = Object.keys(fileCounts)
                    .sort((a, b) => fileCounts[b] - fileCounts[a])
                    .slice(0, 10)
                    .map(name => ({ name, count: fileCounts[name] }));
                renderTopFilesTable(topFiles);

                renderAnalyticsChart('dailyVisitsChart', 'line', 'الزوار الفريدون يومياً', sortedDailyVisits);
                renderAnalyticsChart('dailyResultsChart', 'line', 'زوار قسم النتائج يومياً', sortedDailyResults);
                renderAnalyticsChart('specChart', 'pie', 'التخصصات (زوار فريدون)', specCountsTotal);
                renderAnalyticsChart('levelChart', 'doughnut', 'المستويات (زوار فريدون)', levelCountsTotal);

                // حفظ البيانات لاستخدامها عند تصدير الصورة
                window.__lastStatsData = {
                    startDate, endDate,
                    displayedVisits, uniqueResults,
                    todayVisitors: todayVisitors.size,
                    downloadEvents, searchEvents,
                    totalEvents: allData.length,
                    topFiles,
                    specCountsTotal, levelCountsTotal,
                    dailyVisitsTotal: sortedDailyVisits,
                    dailyResultsTotal: sortedDailyResults
                };

            } catch(e) {
                console.error(e);
                errDiv.textContent = "حدث خطأ أثناء جلب البيانات أو أن الجدول (analytics) غير موجود.";
                errDiv.classList.remove('hidden');
            }
        }

        function renderTopFilesTable(rows) {
            const box = document.getElementById('top-files-body');
            if (!box) return;
            if (!rows || rows.length === 0) {
                box.innerHTML = '<tr><td colspan="3" style="padding:14px; text-align:center; color:var(--text-secondary); font-weight:700;">لا توجد بيانات في هذه الفترة</td></tr>';
                return;
            }
            box.innerHTML = rows.map((r, i) => (
                '<tr>' +
                '<td style="padding:10px 12px; border-bottom:1px solid var(--border-color); font-weight:800; color:var(--primary-color);">' + (i + 1) + '</td>' +
                '<td style="padding:10px 12px; border-bottom:1px solid var(--border-color); font-weight:700; word-break:break-word;">' + String(r.name).replace(/[<>&]/g, '') + '</td>' +
                '<td style="padding:10px 12px; border-bottom:1px solid var(--border-color); font-weight:800; text-align:center;">' + r.count + '</td>' +
                '</tr>'
            )).join('');
        }
        function renderAnalyticsChart(canvasId, type, label, dataObj) {
            const ctx = document.getElementById(canvasId).getContext('2d');
            if (activeCharts[canvasId]) activeCharts[canvasId].destroy();

            const labels = Object.keys(dataObj);
            const dataVals = Object.values(dataObj);

            let dataset = {
                label: label,
                data: dataVals,
                borderWidth: 1
            };

            if (type === 'line') {
                dataset.borderColor = '#15803d'; 
                dataset.backgroundColor = 'rgba(21,128,61,0.22)';
                dataset.fill = true;
                dataset.tension = 0.35;
                dataset.borderWidth = 4;
                dataset.pointBackgroundColor = '#15803d';
                dataset.pointBorderColor = '#052e16';
                dataset.pointBorderWidth = 1.5;
                dataset.pointRadius = 4;
                dataset.pointHoverRadius = 6;
            } else {
                dataset.backgroundColor = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#8AC926', '#1982C4', '#F15BB5', '#00BBF9'];
            }

            activeCharts[canvasId] = new Chart(ctx, {
                type: type,
                data: {
                    labels: labels,
                    datasets: [dataset]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { font: { family: 'Tajawal', size: 14, weight: 'bold' } } },
                        tooltip: {
                            titleFont: { family: 'Tajawal', size: 16 },
                            bodyFont: { family: 'Tajawal', size: 16, weight: 'bold' },
                            padding: 12,
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) { label += ': '; }
                                    if (context.parsed.y !== undefined) { 
                                        label += context.parsed.y + (type === 'line' ? ' زيارة' : ' (زيارة)'); 
                                    } else if (context.parsed !== null) { 
                                        label += context.parsed + ' (زيارة)'; 
                                    }
                                    return label;
                                }
                            }
                        }
                    },
                    scales: type === 'line' ? {
                        y: { beginAtZero: true, ticks: { color: '#0f172a', font: { family: 'Tajawal', weight: 'bold', size: 13 } }, grid: { color: 'rgba(15,23,42,0.12)' } },
                        x: { ticks: { color: '#0f172a', font: { family: 'Tajawal', weight: 'bold', size: 12 } }, grid: { color: 'rgba(15,23,42,0.08)' } }
                    } : {} 
                }
            });
        }

        async function openTopFilesPage() {
            if (!hasPermission('view_analytics')) { alert('❌ ليست لديك صلاحية عرض إحصاءات الملفات.'); return; }
            document.getElementById('top-files-overlay')?.classList.remove('hidden');
            const err=document.getElementById('top-files-page-error');
            if(err) err.classList.add('hidden');
            await loadTopFilesPage();
        }

        function closeTopFilesPage() {
            document.getElementById('top-files-overlay')?.classList.add('hidden');
            document.getElementById('admin-dashboard-overlay')?.classList.remove('hidden');
            adminDashHome();
        }

        async function loadTopFilesPage() {
            if (!supabaseClient) return;
            const body=document.getElementById('top-files-page-body');
            const err=document.getElementById('top-files-page-error');
            if(err) err.classList.add('hidden');
            if(body) body.innerHTML='<tr><td colspan="5" style="padding:20px;text-align:center;font-weight:800;">⏳ جاري تحميل البيانات...</td></tr>';
            try {
                const start=document.getElementById('top-files-start-date')?.value || '';
                const end=document.getElementById('top-files-end-date')?.value || '';
                let all=[]; let from=0; const batch=1000;
                while(true){
                    // دعم السجلات القديمة التي أضيفت لها لاحقة "(متكرر)"، مع السجلات الجديدة.
                    let q=supabaseClient.from('analytics').select('action_type,action_detail,created_at').in('action_type',['تحميل ملف','فتح ملف','تحميل ملف (متكرر)','فتح ملف (متكرر)']).order('created_at',{ascending:false}).range(from,from+batch-1);
                    if(start) q=q.gte('created_at',start+'T00:00:00.000Z');
                    if(end) q=q.lte('created_at',end+'T23:59:59.999Z');
                    const {data,error}=await q; if(error) throw error;
                    all=all.concat(data||[]);
                    if(!data || data.length<batch) break;
                    from+=batch;
                }
                const map={}; let opens=0,downloads=0;
                all.forEach(r=>{
                    const name=String(r.action_detail||'ملف غير معروف').trim()||'ملف غير معروف';
                    if(!map[name]) map[name]={name,open:0,download:0,total:0};
                    if(String(r.action_type||'').startsWith('فتح ملف')){map[name].open++;opens++;}
                    if(String(r.action_type||'').startsWith('تحميل ملف')){map[name].download++;downloads++;}
                    map[name].total++;
                });
                const rows=Object.values(map).sort((a,b)=>b.total-a.total||b.download-a.download||b.open-a.open).slice(0,50);
                document.getElementById('top-files-total-events').textContent=all.length.toLocaleString('en-US');
                document.getElementById('top-files-open-events').textContent=opens.toLocaleString('en-US');
                document.getElementById('top-files-download-events').textContent=downloads.toLocaleString('en-US');
                document.getElementById('top-files-unique-count').textContent=Object.keys(map).length.toLocaleString('en-US');
                if(!rows.length){body.innerHTML='<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--text-secondary);font-weight:700;">لا توجد تفاعلات مسجلة في هذه الفترة.</td></tr>';return;}
                body.innerHTML=rows.map((r,i)=>'<tr><td style="padding:11px;text-align:center;border-bottom:1px solid var(--border-color);font-weight:900;color:var(--primary-color);">'+(i+1)+'</td><td style="padding:11px;border-bottom:1px solid var(--border-color);font-weight:800;word-break:break-word;">'+String(r.name).replace(/[<>&]/g,'')+'</td><td style="padding:11px;text-align:center;border-bottom:1px solid var(--border-color);font-weight:800;color:#15803d;">'+r.open+'</td><td style="padding:11px;text-align:center;border-bottom:1px solid var(--border-color);font-weight:800;color:#c2410c;">'+r.download+'</td><td style="padding:11px;text-align:center;border-bottom:1px solid var(--border-color);font-weight:900;">'+r.total+'</td></tr>').join('');
            } catch(e) {
                console.error('top files analytics',e);
                if(body) body.innerHTML='<tr><td colspan="5" style="padding:20px;text-align:center;color:#b91c1c;font-weight:800;">تعذر تحميل البيانات.</td></tr>';
                if(err){err.textContent='❌ تعذر قراءة تحليلات الملفات من قاعدة البيانات.';err.classList.remove('hidden');}
            }
        }

        function closeAnalyticsDashboard() {
            document.getElementById('analytics-overlay').classList.add('hidden');
            document.getElementById('upload-modal-overlay').classList.remove('hidden');
        }
function closeAnalyticsDashboard() {
    document.getElementById('analytics-overlay').classList.add('hidden');
    document.getElementById('upload-modal-overlay').classList.remove('hidden');
}