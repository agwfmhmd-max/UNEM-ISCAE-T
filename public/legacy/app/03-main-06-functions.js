/* ===== تقسيم 03-main.js — دوال =====
   يُحمَّل بعد الملفات التي تسبقه وقبل التي تليه (الترتيب محدد في src/legacy/app.html).
   الدوال: openSmartViewer، runCloudinaryAudit، handleGlobalSearch، closeSearch، closePdfViewer، openUnionModal، toggleAccordion، closeUnionModal، openWebViewer، closeWebViewer، hasPermission، escapeHtml، loadMyPermissions، openAdminDashboard، updateAdminDashboardCards، closeAdminDashboard، adminDashHome، adminDashOpen، renderWhatsAppAdmin، toggleWhatsAppSpecField، loadWhatsAppAdminList، saveWhatsAppGroup، deleteWhatsAppGroup، whatsappText، whatsappSpecLabel، whatsappCleanSpecDescription، openWhatsAppHub، whatsappGoHome، renderWhatsAppHubLevels، selectWhatsAppHubLevel، renderWhatsAppSpecializations، whatsappBackToLevels، whatsappBackToSpecializations، whatsappGroupLink، renderWhatsAppHubGroups، loadWhatsAppSpecializationGroups، openWhatsAppGroups، closeWhatsAppGroups، renderPermissionsAdmin، loadSupervisorPermission، setAllSupervisorPermissions، saveSupervisorPermission، setAdminSectionVisibility، openUploadModal، closeUploadModal، semestersForLevel
   (الشيفرة منقولة حرفياً من 03-main.js دون أي تعديل) */


        /**
         * فتح الملف داخل الموقع (لا تنزيل إطلاقاً):
         * تحديد المصدر → رابط الفتح → عارض Google → iframe داخل الـmodal
         */
        async function openSmartViewer(fileObj) {
            const safeName = String(fileObj.name || '').replace(/^"|"$/g, '');
            if(typeof gtag === 'function') gtag('event', 'view_file', { 'file_name': safeName });
            logSupabaseAnalytics('فتح ملف', safeName);

            document.getElementById('pdf-viewer-overlay').classList.remove('hidden');
            document.getElementById('viewer-filename').textContent = safeName;
            document.getElementById('rendering-msg').style.display = 'block';
            document.getElementById('viewer-action-btn').onclick = (e) => { if (e) e.stopPropagation(); triggerDownload(fileObj); };

            const area = document.getElementById('pdf-render-area');
            area.innerHTML = '';
            if (viewerFallbackTimer) { clearTimeout(viewerFallbackTimer); viewerFallbackTimer = null; }

            // 1) تحديد المصدر وبناء الرابط (مع إعادة بناء رابط Cloudinary عند الحاجة)
            if (fileObj.source === 'cloudinary' && !isRealCloudinaryUrl(fileObj.cloudinary_url)) {
                await ensureCloudinaryCloudName();
            }
            const openUrl = getDocumentOpenUrl(fileObj);
            if (!openUrl) {
                logDocumentError('openSmartViewer: رابط غير متوفر', fileObj);
                document.getElementById('rendering-msg').style.display = 'none';
                area.innerHTML = '<div style="padding:24px; text-align:center; font-weight:800; color:#b91c1c;">❌ تعذر تحديد رابط هذا الملف.<br><span style="font-weight:600; font-size:0.9rem; color:#334155;">يرجى إبلاغ المشرف.</span></div>';
                return;
            }

            // [UNEM] عرض موثوق: قراءة الملف وعرضه عبر pdf.js (GitHub / Cloudinary / Supabase)،
            // وعند أي فشل نكمل بالعارض السابق أدناه كما كان.
            try {
                if (window.UNEMFiles && await window.UNEMFiles.renderPdf(fileObj, area)) {
                    const rm = document.getElementById('rendering-msg'); if (rm) rm.style.display = 'none';
                    return;
                }
            } catch (e) { console.warn('[UNEM] pdf.js viewer fallback', e); }

            // 2) عرض PDF داخل الموقع عبر عارض Google (نفس السلوك لملفات GitHub و Cloudinary)
            const viewerUrl = getPdfViewerUrl(fileObj);
            const iframe = document.createElement('iframe');
            iframe.id = 'pdf-direct-frame';
            iframe.setAttribute('allowfullscreen', 'true');
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.border = 'none';
            iframe.style.display = 'block';
            iframe.src = viewerUrl;
            iframe.onload = () => { document.getElementById('rendering-msg').style.display = 'none'; };
            iframe.onerror = () => showViewerFallback(fileObj, 'تعذر عرض الملف داخل العارض.');
            area.appendChild(iframe);

            // 3) بدائل (بدون تنزيل تلقائي) إذا لم يظهر العرض
            viewerFallbackTimer = setTimeout(() => {
                const msgVisible = document.getElementById('rendering-msg').style.display !== 'none';
                if (msgVisible) showViewerFallback(fileObj, 'تعذر عرض الملف داخل العارض.');
            }, 9000);
        }



        /** أداة المشرف: فحص سلامة روابط Cloudinary (لا تحذف أي شيء) */
        async function runCloudinaryAudit() {
            if (!hasPermission('view_analytics')) return;
            const box = document.getElementById('cloudinary-audit-result');
            if (!box) return;
            box.style.display = 'block';
            box.innerHTML = '⏳ جاري الفحص...';
            if (!supabaseClient) { box.innerHTML = '❌ تعذر الاتصال بقاعدة البيانات.'; return; }
            try {
                const { data, error } = await supabaseClient
                    .from('documents')
                    .select('id,name,original_name,source,cloudinary_url,cloudinary_public_id,cloudinary_resource_type,created_at')
                    .order('created_at', { ascending: false })
                    .limit(1000);
                if (error) throw error;
                const rows = data || [];
                const valid = [], empty = [], pointer = [], invalid = [];
                rows.forEach(r => {
                    const u = r.cloudinary_url;
                    if (!u) { empty.push(r); return; }
                    if (u.includes('supabase.co') || u.includes('UNEM_CLOUDINARY_POINTER') || u.startsWith('/api/')) { pointer.push(r); return; }
                    if (isRealCloudinaryUrl(u)) { valid.push(r); return; }
                    invalid.push(r);
                });
                const list = (arr) => arr.slice(0, 20).map(r => `<li style="margin-bottom:4px;">${(r.original_name || r.name)} <span style="color:#64748b;">(${r.cloudinary_resource_type || 'raw'})</span></li>`).join('') || '<li style="color:#64748b;">لا شيء</li>';
                box.innerHTML = `
                    <div style="font-weight:800; margin-bottom:8px;">النتيجة: ${rows.length} سجل</div>
                    <div style="color:#15803d; font-weight:800;">✅ روابط Cloudinary صحيحة: ${valid.length}</div>
                    <div style="color:#b45309; font-weight:800; margin-top:6px;">⚠️ روابط فارغة: ${empty.length}</div><ul>${list(empty)}</ul>
                    <div style="color:#b91c1c; font-weight:800;">❌ روابط Supabase / JSON pointer: ${pointer.length}</div><ul>${list(pointer)}</ul>
                    <div style="color:#b91c1c; font-weight:800;">❌ روابط غير صالحة: ${invalid.length}</div><ul>${list(invalid)}</ul>
                    <div style="margin-top:8px; color:#334155;">هذه الأداة للفحص فقط ولا تحذف أي ملف. لإصلاح الروابط المعطوبة نفّذ دالة الإصلاح في قاعدة البيانات: <code>select public.repair_cloudinary_urls('CLOUD_NAME');</code></div>`;
            } catch (err) {
                console.error(err);
                box.innerHTML = '❌ تعذر تنفيذ الفحص: ' + (err.message || '');
            }
        }

        async function handleGlobalSearch(query) {
            if(query.length === 0) { closeSearch(); return; }
            if(query.length > 2) {
                if(typeof gtag === 'function') gtag('event', 'search', { 'search_term': query });
                logSupabaseAnalytics('بحث', query); 
            }

            hideAll(); document.getElementById('file-list-container').classList.remove('hidden'); document.getElementById('file-list-back-btn').setAttribute('onclick', 'closeSearch()'); document.getElementById('selected-subject-name').textContent = query;
            const pdfList = document.getElementById('pdf-list'); pdfList.innerHTML = ""; const term = normalizeText(query);
            if (allFiles.length === 0) await fetchFilesFromGitHub(currentBranch || 'main');
            const results = allFiles.filter(file => {
                                        const searchableName = String(file.name || file.path || '');
                                        return isSearchableDocument(file) && normalizeText(searchableName).includes(term);
                                    })
                                    .map(file => ({...file, source: 'github'}));

            // البحث أيضاً داخل الملفات الجديدة المرفوعة على Cloudinary
            let docResults = [];
            if (supabaseClient && query.length > 1) {
                try {
                    const { data } = await supabaseClient
                        .from('documents')
                        .select('id,name,original_name,source,cloudinary_url,cloudinary_public_id,cloudinary_resource_type,mime_type,folder,storage_path,github_url,github_path,file_type,subject,subject_code,status,created_at')
                        .or(`name.ilike.%${query}%,original_name.ilike.%${query}%,subject.ilike.%${query}%`)
                        .limit(50);
                    docResults = (data || []).map(mapDocumentRow).filter(isSearchableDocument);
                } catch (err) { console.error(err); }
            }

            const all = [...docResults, ...results];
            pdfList.innerHTML = "";
            if(all.length === 0) { document.getElementById('no-files-msg').classList.remove('hidden'); }
            else { document.getElementById('no-files-msg').classList.add('hidden'); all.forEach(file => pdfList.appendChild(buildFileListItem(file))); }
        }
        
        function closeSearch() { hideAll(); document.getElementById('main-menu').classList.remove('hidden'); }
        function closePdfViewer() { if (viewerFallbackTimer) { clearTimeout(viewerFallbackTimer); viewerFallbackTimer = null; } document.getElementById('pdf-viewer-overlay').classList.add('hidden'); document.getElementById('pdf-render-area').innerHTML = ""; }
        function openUnionModal() { document.getElementById('union-modal-overlay').classList.remove('hidden'); }
        
        function toggleAccordion(contentId, btn) {
            const content = document.getElementById(contentId);
            const icon = btn.querySelector('i');
            const isActive = content.classList.contains('active');

            document.querySelectorAll('.accordion-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.accordion-btn').forEach(el => {
                el.classList.remove('active-btn');
                el.querySelector('i').className = 'fas fa-chevron-down';
            });

            if (!isActive) {
                content.classList.add('active');
                btn.classList.add('active-btn');
                icon.className = 'fas fa-chevron-up';
            }
        }

        function closeUnionModal() { 
            document.getElementById('union-modal-overlay').classList.add('hidden'); 
            document.querySelectorAll('.accordion-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.accordion-btn').forEach(el => { el.classList.remove('active-btn'); el.querySelector('i').className = 'fas fa-chevron-down'; });
        }
        
        function openWebViewer(url, title) { document.getElementById('web-viewer-title').textContent = title; document.getElementById('web-frame').src = url; document.getElementById('web-viewer-overlay').classList.remove('hidden'); }
        function closeWebViewer() { document.getElementById('web-viewer-overlay').classList.add('hidden'); document.getElementById('web-frame').src = ''; }
        function hasPermission(key){
            if(isAdmin()) return true;
            if(key === 'view_student_registrations') return myPermissions.view_student_registrations === true || myPermissions.manage_students === true;
            return myPermissions[key] === true || (key === 'upload_files' && currentUserRole === 'uploader');
        }
function escapeHtml(value){
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
        async function loadMyPermissions(){
            myPermissions={};
            if(isAdmin() || !supabaseClient){ isAdminLoggedIn=canUpload(); syncAdminQuickAccess(); window.mdaRefreshAdminCards?.(); return; }
            const email=(await supabaseClient.auth.getUser()).data?.user?.email;
            if(!email){ isAdminLoggedIn=canUpload(); syncAdminQuickAccess(); window.mdaRefreshAdminCards?.(); return; }
            const {data,error}=await supabaseClient.from('supervisor_permissions').select('*').eq('email',email.toLowerCase()).maybeSingle();
            if(error) throw error;
            if(data) ADMIN_PERMISSIONS.forEach(([k])=>myPermissions[k]=data[k]===true);
            isAdminLoggedIn=canUpload();
            syncAdminQuickAccess();
            window.mdaRefreshAdminCards?.();
        }
        function openAdminDashboard(){
            if(!supabaseClient){
                document.getElementById('admin-login-overlay').classList.remove('hidden');
                return;
            }

            /*
             * نظام الدخول الجديد:
             * - Super Admin: لوحة المشرف الرئيسي كاملة.
             * - Supervisor بصلاحية رفع فقط: صفحة الرفع مباشرة.
             * - Supervisor لديه رفع + صلاحيات أخرى: تظهر له لوحة مشرف مصغرة
             *   تحتوي فقط على الأقسام التي منحه المشرف الرئيسي صلاحيتها.
             *
             * مهم: لا نربط ظهور اللوحة بوجود upload_files فقط، لأن ذلك كان
             * سبب اختفاء الصلاحيات الإضافية سابقاً.
             */
            loadMyPermissions().then(()=>{
                if(!hasAdminDashboardAccess()){
                    document.getElementById('admin-login-overlay').classList.remove('hidden');
                    return;
                }
                if(!isAdmin()){
                    const nonUploadPermissions = ADMIN_PERMISSIONS
                        .map(([key])=>key)
                        .filter(key=>key !== 'upload_files' && myPermissions[key] === true);

                    if(!hasPermission('upload_files') && nonUploadPermissions.length === 0){
                        alert('❌ ليست لديك صلاحية للوصول إلى لوحة الإدارة.');
                        return;
                    }

                    // إذا كانت الصلاحية الوحيدة هي رفع الملفات، افتح صفحة الرفع مباشرة.
                    if(nonUploadPermissions.length === 0 && hasPermission('upload_files')){
                        closeAdminDashboard();
                        openUploadModal('upload');
                        return;
                    }

                    // إذا كانت هناك صلاحيات إضافية، اعرض لوحة المشرف المصغرة.
                    const overlay=document.getElementById('admin-dashboard-overlay');
                    const home=document.getElementById('admin-dashboard-home');
                    if(!overlay || !home) return;
                    overlay.classList.remove('hidden');
                    adminDashHome();
                    updateAdminDashboardCards();
                    const title=overlay.querySelector('.admin-dashboard-title');
                    const subtitle=overlay.querySelector('.admin-dashboard-subtitle');
                    if(title) title.textContent='لوحة المشرف';
                    if(subtitle) subtitle.textContent='الأقسام التي منحك المشرف الرئيسي صلاحية الوصول إليها';
                    return;
                }

                // المشرف الرئيسي يرى اللوحة الكاملة.
                const overlay=document.getElementById('admin-dashboard-overlay');
                const home=document.getElementById('admin-dashboard-home');
                if(home) home.querySelectorAll('.admin-dash-card').forEach(b=>b.style.display='none');
                overlay.classList.remove('hidden');
                adminDashHome();
                updateAdminDashboardCards();
                const title=overlay.querySelector('.admin-dashboard-title');
                const subtitle=overlay.querySelector('.admin-dashboard-subtitle');
                if(title) title.textContent='لوحة المشرف الرئيسي';
                if(subtitle) subtitle.textContent='إدارة المنصة والصلاحيات والمجموعات من مكان واحد';
            }).catch(err=>{
                console.error('openAdminDashboard permissions', err);
                alert('❌ تعذر تحميل صلاحيات الحساب.');
            });
        }
        function updateAdminDashboardCards(){
            const map={
                upload:'upload_files',
                whatsapp:'manage_whatsapp',
                permissions:'__admin_only__',
                analytics:'view_analytics',
                announcements:'manage_announcements',
                notifications:'send_notifications',
                types:'manage_document_types',
                'top-files':'view_analytics',
                schedules:'manage_schedules',
                students:'view_student_registrations',
                'platform-settings':'manage_platform_settings',
                'file-order':'manage_file_order',
                'curriculum-subjects':'manage_curriculum_subjects',
                community:'moderate_community'
            };
            document.querySelectorAll('#admin-dashboard-home .admin-dash-card').forEach(b=>{
                const onclick=b.getAttribute('onclick')||'';
                let key=b.getAttribute('data-dash-key') || Object.keys(map).find(k=>onclick.includes("'"+k+"'")||onclick.includes(k+'Dashboard'));
                if(!key) return;
                const allowed=map[key]==='__admin_only__' ? isAdmin() : hasPermission(map[key]);
                b.style.display=allowed?'flex':'none';
                b.style.visibility=allowed?'visible':'hidden';
                b.style.pointerEvents=allowed?'auto':'none';
            });
        }

        function closeAdminDashboard(){document.getElementById('admin-dashboard-overlay')?.classList.add('hidden');}
        function adminDashHome(){currentAdminDashPage=null;document.getElementById('admin-dashboard-home').style.display='grid';document.getElementById('admin-dashboard-page').style.display='none';}
        async function adminDashOpen(page){
            const required={
                upload:'upload_files',
                whatsapp:'manage_whatsapp',
                announcements:'manage_announcements',
                notifications:'send_notifications',
                types:'manage_document_types',
                analytics:'view_analytics',
                'top-files':'view_analytics',
                students:'view_student_registrations',
                'platform-settings':'manage_platform_settings',
                'file-order':'manage_file_order',
                'curriculum-subjects':'manage_curriculum_subjects',
                curriculum:'manage_curriculum_subjects'
            }[page];
            if(page==='permissions'&&!isAdmin()) return alert('❌ إدارة الصلاحيات للمشرف الرئيسي فقط.');
            if(required && !hasPermission(required)) return alert('❌ ليست لديك الصلاحية لهذا القسم.');
            currentAdminDashPage=page;
            if(page==='top-files'){ closeAdminDashboard(); openTopFilesPage(); return; }
            if(page==='analytics'){ closeAdminDashboard(); openAnalyticsDashboard(); return; }
            if(page==='platform-settings'){ closeAdminDashboard(); openUploadModal('settings'); return; }
            if(page==='curriculum-subjects'){ closeAdminDashboard(); openUploadModal('curriculum-subjects'); return; }
            if(page==='file-order'){
                document.getElementById('admin-dashboard-home').style.display='none';
                document.getElementById('admin-dashboard-page').style.display='block';
                document.getElementById('admin-dashboard-page-content').innerHTML='<div class="admin-page-box"><h3>↕️ ترتيب ملفات المواد</h3><p>افتح التخصص والمستوى والفصل والمادة من الواجهة الرئيسية؛ ستظهر لك أدوات تحريك الملفات إلى الأعلى أو الأسفل بجوار الملف.</p></div>';
                return;
            }
            if(page==='upload'||page==='announcements'||page==='notifications'||page==='types'||page==='curriculum-subjects'){
                closeAdminDashboard();
                openUploadModal(page);
                return;
            }
            document.getElementById('admin-dashboard-home').style.display='none'; document.getElementById('admin-dashboard-page').style.display='block';
            const c=document.getElementById('admin-dashboard-page-content');
            if(page==='permissions'){renderPermissionsAdmin();return;}
            if(page==='whatsapp'){renderWhatsAppAdmin();return;}
            if(page==='students'){renderStudentsAdmin();return;}
        }

        async function renderWhatsAppAdmin(){
            const c=document.getElementById('admin-dashboard-page-content');
            c.innerHTML='<div class="admin-page-box"><h3>🟢 إدارة مجموعات WhatsApp</h3><p>يمكنك إضافة مجموعات عامة للمستوى (تظهر لجميع التخصصات) أو مجموعة خاصة بتخصص ومستوى محدد. عند إضافة رابط جديد لنفس النوع والمستوى يتم استبدال الرابط القديم تلقائياً.</p><div class="wa-admin-row"><div style="display:grid;gap:8px;grid-template-columns:repeat(4,1fr)"><select id="wa-type" onchange="toggleWhatsAppSpecField()"><option value="general">🌐 مجموعة عامة للمستوى</option><option value="specialization">🎓 مجموعة خاصة بالتخصص</option></select><select id="wa-spec"><optgroup label="Licence"><option>BA</option><option>FC</option><option>TCM</option><option>GRH</option><option>SAE</option><option>IG</option></optgroup><optgroup label="Master"><option>MASTER_FC</option><option>MASTER_IG</option></optgroup></select><select id="wa-level"><optgroup label="Licence"><option>L1</option><option>L2</option><option>L3</option></optgroup><optgroup label="Master"><option>M1</option><option>M2</option></optgroup></select><input id="wa-url" type="url" placeholder="رابط مجموعة WhatsApp"></div><div class="wa-actions"><button class="wa-save" onclick="saveWhatsAppGroup()">حفظ الرابط</button></div></div><div id="wa-admin-list">⏳ جاري التحميل...</div></div>'; toggleWhatsAppSpecField();
            await loadWhatsAppAdminList();
        }
        function toggleWhatsAppSpecField(){
            const type=document.getElementById('wa-type')?.value||'general';
            const spec=document.getElementById('wa-spec');
            if(spec){spec.disabled=type==='general'; spec.style.opacity=type==='general'?'.55':'1';}
        }
        async function loadWhatsAppAdminList(){
            const el=document.getElementById('wa-admin-list'); if(!el||!supabaseClient)return;
            const {data,error}=await supabaseClient.from('whatsapp_groups').select('*').order('level').order('group_type').order('specialization');
            if(error){el.innerHTML='<div class="status-msg error">❌ '+escapeHtml(error.message)+'</div>';return;}
            const rows=data||[];
            el.innerHTML=rows.map(x=>{
                const isGeneral=(x.group_type||'specialization')==='general';
                const title=isGeneral?`🌐 مجموعة عامة · ${escapeHtml(x.level)}`:`🎓 ${escapeHtml(whatsappSpecLabel(x.specialization))} · ${escapeHtml(x.level)}`;
                const badge=isGeneral?'لجميع التخصصات':'خاصة بالتخصص';
                return `<div class="wa-admin-row"><div><b>${title}</b><div style="font-size:.78rem;color:#64748b;margin-top:5px">${badge} · ${escapeHtml(x.url)}</div></div><div class="wa-actions"><button class="wa-del" onclick="deleteWhatsAppGroup('${x.id}')">حذف</button></div></div>`;
            }).join('')||'<p>لا توجد مجموعات مضافة.</p>';
        }
        async function saveWhatsAppGroup(){
            if(!hasPermission('manage_whatsapp'))return;
            const v=id=>document.getElementById(id)?.value.trim()||'';
            const type=v('wa-type')||'general';
            const spec=v('wa-spec').toUpperCase();
            const level=v('wa-level').toUpperCase();
            const url=v('wa-url');
            const saveBtn=document.querySelector('#admin-dashboard-page-content .wa-save');

            if(!['general','specialization'].includes(type))return alert('❌ اختر نوع المجموعة.');
            if(type==='specialization'&&!spec)return alert('❌ اختر التخصص.');
            if(!level)return alert('❌ اختر المستوى.');
            if(!url)return alert('❌ أدخل رابط مجموعة WhatsApp.');
            if(!/^https:\/\/(chat\.whatsapp\.com|wa\.me)\//i.test(url)) return alert('❌ أدخل رابط WhatsApp صالحاً.');

            if(saveBtn){saveBtn.disabled=true;saveBtn.dataset.originalText=saveBtn.textContent;saveBtn.textContent='⏳ جاري الحفظ...';}
            try{
                if(!supabaseClient) throw new Error('Supabase غير متصل.');
                // نستبدل الرابط السابق لنفس النوع والمستوى (وللتخصص نفسه عند النوع الخاص).
                let del=supabaseClient.from('whatsapp_groups').delete().eq('level',level).eq('group_type',type);
                if(type==='specialization') del=del.eq('specialization',spec);
                else del=del.is('specialization',null);
                const {error:deleteError}=await del;
                if(deleteError) throw deleteError;

                const {error:insertError}=await supabaseClient.from('whatsapp_groups').insert({
                    name:type==='general'?'مجموعة WhatsApp عامة':'مجموعة WhatsApp للتخصص',
                    academic_year:null,
                    specialization:type==='general'?null:spec,
                    level:level,
                    group_type:type,
                    url:url,
                    is_active:true
                });
                if(insertError) throw insertError;
                const input=document.getElementById('wa-url'); if(input)input.value='';
                await loadWhatsAppAdminList();
                alert('✅ تم حفظ رابط WhatsApp بنجاح.');
            }catch(error){alert('❌ تعذر حفظ الرابط: '+(error?.message||error));}
            finally{if(saveBtn){saveBtn.disabled=false;saveBtn.textContent=saveBtn.dataset.originalText||'حفظ الرابط';}}
        }
        async function deleteWhatsAppGroup(id){if(!confirm('حذف رابط مجموعة WhatsApp؟'))return;const {error}=await supabaseClient.from('whatsapp_groups').delete().eq('id',id);if(error)alert('❌ '+error.message);else loadWhatsAppAdminList();}

        function whatsappText(key, fallback){
            return (i18n[currentLang] && i18n[currentLang][key]) || fallback;
        }
        function whatsappSpecLabel(spec){
            const value=String(spec||'').toUpperCase();
            const key=value==='MASTER_FC'?'master_fc_desc':value==='MASTER_IG'?'master_ig_desc':('spec_'+value.toLowerCase());
            return whatsappText(key, value.replace(/^MASTER_/, 'Master '));
        }
        function whatsappCleanSpecDescription(label, description){
            const normalize = value => String(value || '').toLowerCase()
                .replace(/[\u064B-\u065Fـ]/g,'').replace(/[\s،,:;.!؟!?·—–-]+/g,'')
                .replace(/^(ماستر|master|filiere|filière|تخصص)/,'');
            const a=normalize(label), b=normalize(description);
            if(!b || b===a || b.includes(a) || a.includes(b)) return '';
            return description;
        }

        function openWhatsAppHub(){
            const ov=document.getElementById('whatsapp-groups-overlay');
            if(!ov) return;
            ov.classList.remove('hidden');
            document.body.classList.add('whatsapp-page-open');
            const body=document.querySelector('#whatsapp-groups-overlay .whatsapp-hub-body');
            if(body) body.scrollTop=0;
            renderWhatsAppHubLevels();
        }

        function whatsappGoHome(){
            closeWhatsAppGroups();
            const home=document.getElementById('home-page') || document.querySelector('.home-page') || document.querySelector('[data-page="home"]');
            if(home && typeof home.scrollIntoView==='function') home.scrollIntoView({behavior:'smooth',block:'start'});
            window.scrollTo({top:0,behavior:'smooth'});
        }

        function renderWhatsAppHubLevels(){
            const picker=document.getElementById('whatsapp-level-picker');
            const content=document.getElementById('whatsapp-groups-content');
            if(!picker) return;
            const levels=[
                ['L1','level_1','licence'],['L2','level_2','licence'],['L3','level_3','licence'],
                ['M1','level_m1','master'],['M2','level_m2','master']
            ].filter(([, , cycle]) => cycle !== 'master' || (typeof window.unemMasterVisible !== 'function' || window.unemMasterVisible()));
            let previousCycle='';
            picker.innerHTML=levels.map(([level,key,cycle])=>{
                const heading = previousCycle !== cycle
                    ? `<div class="whatsapp-cycle-divider ${cycle}"><span>${escapeHtml(whatsappText(cycle==='master'?'whatsapp_cycle_master':'whatsapp_cycle_licence',cycle==='master'?'Master':'Licence'))}</span></div>`
                    : '';
                previousCycle=cycle;
                return heading + `<button type="button" class="whatsapp-level-card ${cycle==='master'?'master-level':''} ${whatsappHubLevel===level?'active':''}" onclick="selectWhatsAppHubLevel('${level}')"><i class="fas ${cycle==='master'?'fa-graduation-cap':'fa-layer-group'}"></i><strong>${level}</strong><small>${escapeHtml(whatsappText(key,level))}</small></button>`;
            }).join('');
            if(!whatsappHubLevel){
                content?.classList.add('hidden');
                return;
            }
            content?.classList.remove('hidden');
            renderWhatsAppHubGroups(whatsappHubLevel);
        }

        async function selectWhatsAppHubLevel(level){
            whatsappHubLevel=String(level||'').toUpperCase();
            renderWhatsAppHubLevels();
            const content=document.getElementById('whatsapp-groups-content');
            content?.scrollIntoView({behavior:'smooth',block:'nearest'});
        }

        function renderWhatsAppSpecializations(){
            const picker=document.getElementById('whatsapp-specialization-picker');
            if(!picker)return;
            const isMaster = /^M[12]$/i.test(String(whatsappHubLevel||''));
            const list = isMaster ? WHATSAPP_MASTER_SPECIALIZATIONS : WHATSAPP_LICENCE_SPECIALIZATIONS;
            const cycleKey = isMaster ? 'whatsapp_cycle_master' : 'whatsapp_cycle_licence';
            picker.innerHTML = `<div class="whatsapp-spec-cycle-label ${isMaster?'master':''}">${escapeHtml(whatsappText(cycleKey,isMaster?'Master':'Licence'))}</div>` +
                list.map(([spec,key])=>{
                    const label = whatsappSpecLabel(spec);
                    const description = whatsappCleanSpecDescription(label, whatsappText(key, spec));
                    return `<button type="button" class="whatsapp-spec-btn ${isMaster?'master-spec':''}" data-spec="${spec}" onclick="loadWhatsAppSpecializationGroups('${spec}')"><span>${escapeHtml(label)}</span>${description ? `<br><small>${escapeHtml(description)}</small>` : ''}</button>`;
                }).join('');
        }

        function whatsappBackToLevels(){
            whatsappHubLevel='';
            const content=document.getElementById('whatsapp-groups-content');
            content?.classList.add('hidden');
            const result=document.getElementById('whatsapp-specialization-result');
            result?.classList.add('hidden');
            const stage=document.getElementById('whatsapp-specialization-stage');
            stage?.classList.remove('hidden');
            renderWhatsAppHubLevels();
            document.getElementById('whatsapp-level-picker')?.scrollIntoView({behavior:'smooth',block:'nearest'});
        }

        function whatsappBackToSpecializations(){
            document.getElementById('whatsapp-specialization-result')?.classList.add('hidden');
            document.getElementById('whatsapp-specialization-stage')?.classList.remove('hidden');
            document.querySelectorAll('.whatsapp-spec-btn').forEach(btn=>btn.classList.remove('active'));
            document.getElementById('whatsapp-specialization-picker')?.scrollIntoView({behavior:'smooth',block:'nearest'});
        }

        function whatsappGroupLink(group, type, level, spec=''){
            const general=type==='general';
            const specLabel=whatsappSpecLabel(spec);
            const title=general ? whatsappText('whatsapp_general','🌐 مجموعة عامة للمستوى') : whatsappText('whatsapp_specialization','🎓 مجموعة خاصة بالتخصص');
            const desc=general
                ? whatsappText('whatsapp_general_desc','متاحة لجميع التخصصات')+' '+escapeHtml(level)
                : whatsappText('whatsapp_specialization_desc','خاصة بتخصص')+' '+escapeHtml(specLabel)+' · '+escapeHtml(level);
            return `<a class="whatsapp-group-link ${general?'general':'specialization'}" href="${escapeHtml(group.url)}" target="_blank" rel="noopener noreferrer"><span><span class="whatsapp-group-link-title"><i class="fab fa-whatsapp"></i>${title}</span><small>${desc}</small></span><span>${whatsappText('whatsapp_open','فتح ↗')}</span></a>`;
        }

        async function renderWhatsAppHubGroups(level){
            const generalEl=document.getElementById('whatsapp-general-list');
            if(!generalEl||!supabaseClient)return;
            document.getElementById('whatsapp-selected-level-title').textContent=level;
            document.getElementById('whatsapp-specialization-stage')?.classList.remove('hidden');
            document.getElementById('whatsapp-specialization-result')?.classList.add('hidden');
            renderWhatsAppSpecializations();
            generalEl.innerHTML='<div class="whatsapp-empty">'+whatsappText('whatsapp_loading','⏳ جاري التحميل...')+'</div>';

            const {data,error}=await supabaseClient.from('whatsapp_groups')
                .select('*').eq('is_active',true).eq('level',level).eq('group_type','general').order('created_at',{ascending:true});
            if(error){
                generalEl.innerHTML='<div class="whatsapp-empty">'+escapeHtml(whatsappText('whatsapp_load_error','تعذر تحميل المجموعات.'))+'</div>';
                return;
            }
            const groups=data||[];
            generalEl.innerHTML=groups.map(g=>whatsappGroupLink(g,'general',level)).join('') ||
                '<div class="whatsapp-empty">'+whatsappText('whatsapp_no_general','لا توجد مجموعة عامة لهذا المستوى حالياً.')+'</div>';
        }

        async function loadWhatsAppSpecializationGroups(spec){
            const level=whatsappHubLevel;
            if(!level||!supabaseClient)return;
            spec=String(spec||'').trim().toUpperCase();
            if(!WHATSAPP_SPECIALIZATIONS.some(([s])=>s===spec))return;

            document.querySelectorAll('.whatsapp-spec-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.spec===spec));
            document.getElementById('whatsapp-specialization-stage')?.classList.add('hidden');
            const result=document.getElementById('whatsapp-specialization-result');
            result?.classList.remove('hidden');
            const list=document.getElementById('whatsapp-specialization-list');
            if(!list)return;
            list.innerHTML='<div class="whatsapp-empty">'+whatsappText('whatsapp_loading','⏳ جاري التحميل...')+'</div>';

            const {data,error}=await supabaseClient.from('whatsapp_groups')
                .select('*').eq('is_active',true).eq('level',level).eq('group_type','specialization')
                .eq('specialization',spec).order('created_at',{ascending:true});
            if(error){
                list.innerHTML='<div class="whatsapp-empty">'+escapeHtml(whatsappText('whatsapp_load_error','تعذر تحميل المجموعات.'))+'</div>';
                return;
            }
            list.innerHTML=(data||[]).map(g=>whatsappGroupLink(g,'specialization',level,spec)).join('') ||
                '<div class="whatsapp-empty">'+whatsappText('whatsapp_no_spec','لا توجد مجموعة خاصة بهذا التخصص حالياً.')+'</div>';
        }

        /* Backward-compatible entry point for any existing call elsewhere in the legacy app. */
        async function openWhatsAppGroups(spec, level){
            openWhatsAppHub();
            if(level){
                whatsappHubLevel=String(level).toUpperCase();
                renderWhatsAppHubLevels();
                if(spec) await loadWhatsAppSpecializationGroups(String(spec).toUpperCase());
            }
        }

        function closeWhatsAppGroups(){
            document.getElementById('whatsapp-groups-overlay')?.classList.add('hidden');
            document.body.classList.remove('whatsapp-page-open');
            whatsappHubLevel='';
            const body=document.querySelector('#whatsapp-groups-overlay .whatsapp-hub-body');
            if(body) body.scrollTop=0;
        }
        async function renderPermissionsAdmin(){
            const c=document.getElementById('admin-dashboard-page-content');
            c.innerHTML='<div class="admin-page-box"><h3>🔐 صلاحيات المشرفين</h3><p>أدخل البريد الإلكتروني للمشرف، ثم اختر بدقة ما تريد منحه له. تشمل القائمة جميع أقسام التفويض؛ إدارة الصلاحيات نفسها تبقى للمشرف الرئيسي فقط.</p><div class="wa-admin-row"><input id="perm-email" type="email" autocomplete="off" placeholder="email@example.com"><button class="wa-save" onclick="loadSupervisorPermission()">تحميل الصلاحيات</button></div><div id="perm-box"></div></div>';
        }
        async function loadSupervisorPermission(){
            const email=document.getElementById('perm-email').value.trim().toLowerCase();if(!email)return alert('أدخل البريد الإلكتروني للمشرف.');const box=document.getElementById('perm-box');
            box.innerHTML='<p>⏳ جاري تحميل الصلاحيات…</p>';
            const {data,error}=await supabaseClient.from('supervisor_permissions').select('*').eq('email',email).maybeSingle();
            if(error){box.innerHTML='<div class="status-msg error" style="display:block">❌ '+escapeHtml(error.message)+'</div>';return;}
            box.innerHTML='<div style="display:grid;gap:10px;margin-top:15px">'+ADMIN_PERMISSIONS.map(([k,label])=>`<label style="display:flex;gap:10px;align-items:center;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:11px"><input type="checkbox" data-supervisor-permission="1" id="perm-${k}" ${data&&data[k]===true?'checked':''}> <span>${label}</span></label>`).join('')+'<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="wa-save" onclick="setAllSupervisorPermissions(true)">تحديد جميع الصلاحيات</button><button type="button" class="wa-save" style="background:#64748b" onclick="setAllSupervisorPermissions(false)">إلغاء التحديد</button></div><button class="btn-submit" onclick="saveSupervisorPermission()" style="margin-top:4px">حفظ الصلاحيات</button></div>';
        }
        function setAllSupervisorPermissions(checked){document.querySelectorAll('#perm-box input[data-supervisor-permission="1"]').forEach(el=>el.checked=!!checked);}
        async function saveSupervisorPermission(){
            const email=document.getElementById('perm-email')?.value.trim().toLowerCase();
            if(!email)return alert('أدخل البريد الإلكتروني للمشرف.');
            if(!supabaseClient)return alert('❌ تعذر الاتصال بقاعدة البيانات. أعد تحميل الصفحة وحاول مجددًا.');
            const row={email};
            ADMIN_PERMISSIONS.forEach(([k])=>row[k]=!!document.getElementById('perm-'+k)?.checked);
            const button=document.querySelector('#perm-box .btn-submit');
            const originalText=button?.textContent||'حفظ الصلاحيات';
            if(button){button.disabled=true;button.textContent='⏳ جاري حفظ الصلاحيات...';}
            try{
                let {error}=await supabaseClient.from('supervisor_permissions').upsert(row,{onConflict:'email'});
                let communityColumnMissing=false;
                if(error && /moderate_community/i.test(String(error.message||error))){
                    // قاعدة البيانات لم تُحدَّث بعد بصلاحية إشراف المجتمع: احفظ بقية الصلاحيات ونبّه المشرف.
                    const fallbackRow={...row}; delete fallbackRow.moderate_community;
                    communityColumnMissing=true;
                    ({error}=await supabaseClient.from('supervisor_permissions').upsert(fallbackRow,{onConflict:'email'}));
                }
                if(error)throw error;
                alert(communityColumnMissing
                    ? '✅ تم حفظ الصلاحيات، لكن «إشراف المجتمع» لم تُحفظ.\nشغّل db/20261018090000_community_staff_access_and_visitors.sql في Supabase SQL Editor ثم احفظ الصلاحيات مجدداً.'
                    : '✅ تم حفظ صلاحيات المشرف.');
            }catch(error){
                console.error('Supervisor permissions save failed:',error);
                const message=String(error?.message||error);
                const missingSchemaColumn=/Could not find the '.+' column of 'supervisor_permissions' in the schema cache|column .+ does not exist/i.test(message);
                const guidance=missingSchemaColumn
                    ?'قاعدة البيانات أو مخطط Supabase لم يُحدّث بعد. شغّل db/20261017090000_repair_supervisor_permissions_schema.sql في Supabase SQL Editor، ثم أعد تحميل الصفحة وحاول مجددًا.'
                    :message;
                alert('❌ تعذر حفظ صلاحيات المشرف.\n'+guidance);
            }finally{
                if(button){button.disabled=false;button.textContent=originalText;}
            }
        }

        function setAdminSectionVisibility(section){
            const overlay=document.getElementById('upload-modal-overlay'); if(!overlay)return;

            // كل قسم يعتمد على الصلاحية الفعلية، وليس على كون الحساب Super Admin فقط.
            // أدوات الإحصاءات وفحص الملفات للقراءة فقط، وتظهر لمن مُنح view_analytics;
            // أما تعديل الإعدادات العامة فله صلاحية منفصلة.
            let allowed=[];
            if(section==='upload'){
                allowed = ['upload-form'];
                if(hasPermission('view_analytics')) allowed.push('admin-only-analytics');
            } else if(section==='settings'){
                if(hasPermission('manage_platform_settings')) allowed = ['admin-only-analytics','admin-online-public-setting','admin-home-stats-setting','admin-onboarding-prompts-setting'];
            } else if(section==='types'){
                if(hasPermission('manage_document_types')) allowed = ['types-admin-section'];
            } else if(section==='curriculum-subjects'){
                if(hasPermission('manage_curriculum_subjects')) allowed = ['types-admin-section'];
            } else if(section==='announcements'){
                if(hasPermission('manage_announcements')) allowed = ['ann-admin-section'];
            } else if(section==='notifications'){
                if(hasPermission('send_notifications')) allowed = ['push-admin-section'];
            }

            const title=overlay.querySelector('[data-i18n="upload_title"]');
            if(title) title.textContent =
                section==='upload' ? 'لوحة رفع الملفات' :
                section==='types' ? 'إدارة أنواع الملفات' :
                section==='curriculum-subjects' ? 'إدارة المواد المشتركة والماستر' :
                section==='settings' ? 'إعدادات المنصة' :
                section==='announcements' ? 'إدارة الإعلانات' : 'إدارة الإشعارات';

            ['admin-only-analytics','admin-online-public-setting','admin-home-stats-setting','admin-onboarding-prompts-setting','upload-form','types-admin-section','ann-admin-section','push-admin-section'].forEach(id=>{
                const el=document.getElementById(id);
                if(el) el.style.display=allowed.includes(id)?'':'none';
            });
            const toggleSiblingRange=(startId,endId,visible)=>{
                const start=document.getElementById(startId), end=endId?document.getElementById(endId):null;
                if(!start)return;
                let node=start;
                while(node&&node!==end){node.style.display=visible?'':'none';node=node.nextElementSibling;}
            };
            const canManageTypes=hasPermission('manage_document_types');
            const canManageCurriculum=hasPermission('manage_curriculum_subjects');
            toggleSiblingRange('document-types-admin-heading','common-subject-admin-heading',section==='types'&&canManageTypes);
            toggleSiblingRange('common-subject-admin-heading','master-subject-admin-heading',canManageCurriculum&&(section==='types'||section==='curriculum-subjects'));
            toggleSiblingRange('master-subject-admin-heading',null,canManageCurriculum&&(section==='types'||section==='curriculum-subjects'));
            const analyticsButtons=overlay.querySelectorAll('#admin-only-analytics > button');
            analyticsButtons.forEach(el=>el.style.display=section==='settings'?'none':'');
            if(section==='settings'){
                const audit=document.getElementById('cloudinary-audit-result');
                if(audit){audit.innerHTML='';audit.style.display='none';}
            }

            if(!hasPermission('view_analytics')){
                const audit=document.getElementById('cloudinary-audit-result');
                if(audit){ audit.innerHTML=''; audit.style.display='none'; }
            }
        }

        function openUploadModal(section='upload') {
            const required={
                upload:'upload_files',
                types:'manage_document_types',
                announcements:'manage_announcements',
                notifications:'send_notifications',
                settings:'manage_platform_settings',
                'curriculum-subjects':'manage_curriculum_subjects'
            }[section]||'upload_files';

            if (!hasPermission(required)) {
                alert('❌ ليست لديك الصلاحية لهذا القسم.');
                return;
            }

            applyRoleUI();
            setAdminSectionVisibility(section);
            document.getElementById('upload-modal-overlay').classList.remove('hidden');

            if(section==='upload'){
                resetUploadSelectors();
                loadDynamicRegistries();
            }
            if(section==='announcements') loadAnnouncementsAdmin();
            if(section==='settings'){ loadPublicOnlineSetting(); loadHomeStatsSettings(); loadPromptSettings(); }
            if(section==='notifications') {
                loadPushHistoryAdmin();
                loadPushActiveDeviceCount();
            }
        }
        function closeUploadModal() {
            document.getElementById('upload-modal-overlay').classList.add('hidden');
            document.getElementById('upload-status').textContent = '';
            document.getElementById('upload-form').reset();
            resetUploadSelectors();
            uploadQueue = [];
            renderUploadQueue();
            setAdminSectionVisibility('upload');
        }

        function semestersForLevel(level) {
            return SEMESTERS_BY_LEVEL[String(level || '').toUpperCase()] || [];
        }