/* ===== تقسيم 03-main.js — دوال =====
   يُحمَّل بعد الملفات التي تسبقه وقبل التي تليه (الترتيب محدد في src/legacy/app.html).
   الدوال: normalizeFileCategory، getDocumentCategory، buildFileListItem، moveCurrentFileOrder، selectCategory، renderFilteredFiles، isRealCloudinaryUrl، ensureCloudinaryCloudName، getCloudinaryDeliveryUrl، getGithubFileUrl، getDocumentOpenUrl، getDocumentDownloadUrl، getPdfViewerUrl، logDocumentError، triggerDownload، loadFiles، applySubjectCategoryGrid، mergeTypesFoundInFiles، documentsCacheKey، invalidateDocumentsCache، mapDocumentRow، mapGithubFile، fetchDatabaseDocs، refreshCurrentSubjectFiles، fetchAllDocuments، githubFileMatchesSubject، performFileFetching، absoluteUrl، showViewerFallback
   (الشيفرة منقولة حرفياً من 03-main.js دون أي تعديل) */


        /* ==================================================================
           توحيد تصنيف الملف بين قاعدة البيانات (Cours / TD_TP / Devoir / Examen)
           وبين تبويبات الواجهة (cours / td_tp / devoir / examen)
           ================================================================== */
        function normalizeFileCategory(value) {
            const v = String(value || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, '');
            if (!v) return null;
            if (v === 'cours' || v === 'course' || v === 'cour') return 'cours';
            if (v === 'tdtp' || v === 'td' || v === 'tp' || v === 'tptd') return 'td_tp';
            if (v === 'devoir' || v === 'test' || v === 'controle') return 'devoir';
            if (v === 'examen' || v === 'exam' || v === 'archive' || v === 'exemen') return 'examen';
            return null;
        }

        /** التصنيف النهائي لأي مستند: من قاعدة البيانات أولاً ثم من اسم الملف */
        function getDocumentCategory(doc) {
            // 1) النوع الديناميكي المسجّل في قاعدة البيانات (المرجع الأول)
            const raw = doc && (doc.file_type || doc.fileType);
            const match = raw ? findDocumentType(raw) : null;
            if (match) return typeSlug(match.slug || match.name);
            // 2) التوافق مع الأنواع القديمة ثم التخمين من اسم الملف
            return normalizeFileCategory(raw)
                || getFileCategory(String((doc && (doc.name || doc.original_name)) || ''));
        }



        function buildFileListItem(file) {
            const li = document.createElement('li');
            let displayName = file.name.replace(/\[.*?\]/g, '').replace(/^\d+-/, '').replace(/_/g, ' ').replace(/\.(pdf|docx?|pptx?|xlsx?)$/i, '');
            // أيقونة ولون حسب صيغة الملف الفعلية (PDF / Word / PowerPoint / Excel / صورة)
            const typeInfo = (window.UNEMUpload && window.UNEMUpload.infoFor(file.name)) || { icon: 'fa-file-pdf' };
            const infoDiv = document.createElement('div'); infoDiv.className = 'file-info'; infoDiv.innerHTML = `<i class="fas ${typeInfo.icon}"></i> <span>${displayName}</span>`;
            li.style.cursor = 'pointer';
            li.onclick = () => openSmartViewer(file);
            const actionsDiv = document.createElement('div'); actionsDiv.className = 'actions-group';
            actionsDiv.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end;';

            // الوصول إلى الملف: منفصل وظيفياً عن أدوات الإدارة.
            const accessGroup = document.createElement('div');
            accessGroup.style.cssText = 'display:flex;align-items:center;gap:5px;';
            const dlBtn = document.createElement('button'); dlBtn.className = 'action-btn'; dlBtn.title = 'تنزيل الملف'; dlBtn.setAttribute('aria-label','تنزيل الملف'); dlBtn.innerHTML = `<i class="fas fa-arrow-down"></i>`; dlBtn.onclick = (e) => { e.stopPropagation(); triggerDownload(file); };
            accessGroup.appendChild(dlBtn);
            if (window.UNEMFav) { try { accessGroup.appendChild(window.UNEMFav.fileButton(file)); } catch (_) {} }
            actionsDiv.appendChild(accessGroup);

            // أدوات الترتيب: لمن مُنح صلاحيتها، ومستقلة عن التنزيل والحذف.
            if (hasPermission('manage_file_order') && file && file.id && (file.source === 'supabase' || file.source === 'cloudinary')) {
                const orderGroup = document.createElement('div');
                orderGroup.style.cssText = 'display:flex;align-items:center;gap:5px;padding-inline-start:6px;border-inline-start:1px solid var(--border-color);';
                const reorderable = (currentSubjectFiles || [])
                    .filter(f => f && f.id && (f.source === 'supabase' || f.source === 'cloudinary'))
                    .filter(f => isArchiveSpecialCase ? true : getDocumentCategory(f) === currentTab)
                    .slice().sort((a,b) => (Number(a.sort_order ?? 100000) - Number(b.sort_order ?? 100000)) || String(a.name || '').localeCompare(String(b.name || '')));
                const orderIndex = reorderable.findIndex(f => String(f.id) === String(file.id));

                const upBtn = document.createElement('button');
                upBtn.type = 'button'; upBtn.className = 'action-btn'; upBtn.title = 'نقل الملف إلى الأعلى'; upBtn.setAttribute('aria-label','نقل الملف إلى الأعلى');
                upBtn.innerHTML = '<i class="fas fa-chevron-up"></i>';
                upBtn.disabled = orderIndex <= 0;
                upBtn.style.opacity = upBtn.disabled ? '0.4' : '1';
                upBtn.onclick = async (e) => { e.stopPropagation(); await moveCurrentFileOrder(file.id, -1); };

                const downBtn = document.createElement('button');
                downBtn.type = 'button'; downBtn.className = 'action-btn'; downBtn.title = 'نقل الملف إلى الأسفل'; downBtn.setAttribute('aria-label','نقل الملف إلى الأسفل');
                downBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
                downBtn.disabled = orderIndex < 0 || orderIndex >= reorderable.length - 1;
                downBtn.style.opacity = downBtn.disabled ? '0.4' : '1';
                downBtn.onclick = async (e) => { e.stopPropagation(); await moveCurrentFileOrder(file.id, 1); };

                orderGroup.appendChild(upBtn); orderGroup.appendChild(downBtn);
                actionsDiv.appendChild(orderGroup);
            }
            
            if (file.source === 'cloudinary') {
                const badge = document.createElement('span'); badge.className = 'cloud-badge'; badge.textContent = 'جديد';
                infoDiv.appendChild(badge);
            }

            // الحذف يتطلب صلاحية مستقلة (والخادم يعيد التحقق من الصلاحية)
            if (hasPermission('delete_files') && (file.source === 'supabase' || file.source === 'cloudinary')) {
                const managementGroup = document.createElement('div');
                managementGroup.style.cssText = 'display:flex;align-items:center;gap:5px;padding-inline-start:6px;border-inline-start:1px solid var(--border-color);';
                const delBtn = document.createElement('button'); delBtn.className = 'action-btn'; delBtn.title = 'حذف الملف'; delBtn.setAttribute('aria-label','حذف الملف'); delBtn.innerHTML = `<i class="fas fa-trash"></i>`; delBtn.style.color = '#ef4444'; delBtn.style.borderColor = '#fca5a5';
                delBtn.onclick = async (e) => {
                    e.stopPropagation();
                    if(!confirm("تأكيد حذف هذا الملف نهائياً؟")) return;
                    li.style.opacity = '0.4';
                    try {
                        if (file.source === 'supabase') {
                            const { error } = await supabaseClient.storage.from('pdf-files').remove([file.path]);
                            if (error) throw error;
                        } else {
                            const token = await getAccessToken();
                            if (!token) throw new Error('انتهت الجلسة');
                            const res = await fetch(unemApi('/api/public/cloudinary/destroy'), {
                                method: 'POST',
                                headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + token },
                                body: JSON.stringify({ documentId: file.id, publicId: file.publicId, resourceType: file.resourceType || 'raw' })
                            });
                            const out = await res.json().catch(() => null);
                            if (!res.ok) throw new Error((out && out.error) || 'فشل الحذف');
                        }
                        li.remove();
                        currentSubjectFiles = currentSubjectFiles.filter(f => f !== file);
                        documentsCache = {};
                    } catch (err) {
                        console.error(err);
                        alert('❌ تعذر حذف الملف: ' + (err.message || ''));
                        li.style.opacity = '1';
                    }
                };
                managementGroup.appendChild(delBtn);
                actionsDiv.appendChild(managementGroup);
            }
            li.appendChild(infoDiv); li.appendChild(actionsDiv); return li;
        }

        // نقل ملف واحد درجة واحدة للأعلى/للأسفل وحفظه فوراً في Supabase.
        async function moveCurrentFileOrder(fileId, direction) {
            if (!hasPermission('manage_file_order') || !fileId || ![1, -1].includes(direction)) return;
            const items = (currentSubjectFiles || [])
                .filter(f => f && f.id && (f.source === 'supabase' || f.source === 'cloudinary'))
                .filter(f => isArchiveSpecialCase ? true : getDocumentCategory(f) === currentTab)
                .slice().sort((a,b) => (Number(a.sort_order ?? 100000) - Number(b.sort_order ?? 100000)) || String(a.name || '').localeCompare(String(b.name || '')));
            const index = items.findIndex(f => String(f.id) === String(fileId));
            const target = index + direction;
            if (index < 0 || target < 0 || target >= items.length) return;

            const ids = items.map(f => f.id);
            [ids[index], ids[target]] = [ids[target], ids[index]];
            try {
                const { error } = await supabaseClient.rpc('reorder_documents', { p_document_ids: ids });
                if (error) throw error;
                ids.forEach((id, i) => {
                    const item = (currentSubjectFiles || []).find(f => String(f.id) === String(id));
                    if (item) item.sort_order = (i + 1) * 10;
                });
                documentsCache = {};
                await refreshCurrentSubjectFiles();
            } catch (err) {
                console.error(err);
                alert('❌ تعذر تغيير ترتيب الملف: ' + (err.message || ''));
            }
        }

        async function selectCategory(categoryName) { 
            document.getElementById('category-selection-container').classList.add('hidden'); 
            document.getElementById('file-list-container').classList.remove('hidden'); 
            currentTab = categoryName; 
            
            // إظهار التحميل فقط إذا لم تكتمل عملية الجلب في الخلفية
            document.getElementById('pdf-list').innerHTML = "";
            document.getElementById('no-files-msg').classList.add('hidden');
            document.getElementById('loading-spinner').classList.remove('hidden');

            // انتظار اكتمال جلب الملفات (غالباً ستكون قد اكتملت أثناء اختيار المستخدم للتصنيف)
            if (currentSubjectFilesPromise) {
                await currentSubjectFilesPromise;
            }
            
            document.getElementById('loading-spinner').classList.add('hidden');
            renderFilteredFiles(); 
        }

        function renderFilteredFiles() {
            const pdfList = document.getElementById('pdf-list'); pdfList.innerHTML = "";
            let filtered = currentSubjectFiles.filter(isDocumentInCurrentScope);
            filtered = isArchiveSpecialCase ? filtered : filtered.filter(f => getDocumentCategory(f) === currentTab);
            filtered = filtered.slice().sort((a,b) => (Number(a.sort_order ?? 100000) - Number(b.sort_order ?? 100000)) || String(a.name || '').localeCompare(String(b.name || '')));
            if (filtered.length === 0) { 
                document.getElementById('no-files-msg').classList.remove('hidden'); 
            } else { 
                document.getElementById('no-files-msg').classList.add('hidden'); 
                filtered.forEach(file => pdfList.appendChild(buildFileListItem(file))); 
            }
        }

        /* ==================================================================
           طبقة الروابط الموحّدة — مصدر واحد للحقيقة لكل روابط الملفات
           getDocumentOpenUrl / getDocumentDownloadUrl / getPdfViewerUrl
           ================================================================== */

        /** يتحقق أن الرابط رابط Cloudinary مباشر وحقيقي (وليس JSON pointer أو رابط Supabase) */
        function isRealCloudinaryUrl(url) {
            return typeof url === 'string' && /^https:\/\/res\.cloudinary\.com\/[^/]+\/(raw|image|video)\/upload\//.test(url);
        }
        function ensureCloudinaryCloudName() {
            if (cloudinaryCloudName) return Promise.resolve(cloudinaryCloudName);
            if (!cloudNamePromise) {
                cloudNamePromise = fetch(unemApi('/api/public/cloudinary/config'))
                    .then(r => r.ok ? r.json() : null)
                    .then(d => { cloudinaryCloudName = (d && d.cloudName) || null; return cloudinaryCloudName; })
                    .catch(() => null);
            }
            return cloudNamePromise;
        }

        /** رابط تسليم Cloudinary — المرجع الأساسي هو public_id وليس الرابط المخزَّن */
        function getCloudinaryDeliveryUrl(doc, options) {
            const download = !!(options && options.download);
            let base = isRealCloudinaryUrl(doc.cloudinary_url) ? doc.cloudinary_url : null;

            if (!base && doc.cloudinary_public_id && cloudinaryCloudName) {
                const type = ['raw', 'image', 'video'].includes(doc.cloudinary_resource_type) ? doc.cloudinary_resource_type : 'raw';
                const encoded = String(doc.cloudinary_public_id).split('/').map(encodeURIComponent).join('/');
                base = `https://res.cloudinary.com/${cloudinaryCloudName}/${type}/upload/${encoded}`;
            }

            if (!base) {
                // احتياطي: تحويل حقيقي 302 من الخادم (يعيد بناء الرابط من public_id) — لا يعيد JSON أبداً
                if (doc.id) return `/api/public/file?id=${encodeURIComponent(doc.id)}${download ? '&download=1' : ''}`;
                return null;
            }
            return download ? base.replace('/upload/', '/upload/fl_attachment/') : base;
        }

        /** رابط ملف GitHub — من github_url إن وُجد وإلا من github_path */
        function getGithubFileUrl(doc) {
            if (doc.github_url) return doc.github_url;
            const path = doc.github_path || doc.path;
            if (!path) return null;
            const branch = doc.branch || currentBranch || 'main';
            return `https://raw.githubusercontent.com/${repoOwner}/${repoName}/${branch}/${String(path).replace(/^"|"$/g, '').split('/').map(encodeURIComponent).join('/')}`;
        }

        /** رابط الفتح (عرض داخل الموقع) — يعتمد على العمود source وليس على وجود رابط ما */
        function getDocumentOpenUrl(doc) {
            if (doc.source === 'github') return getGithubFileUrl(doc);
            if (doc.source === 'supabase') {
                try { return supabaseClient.storage.from('pdf-files').getPublicUrl(doc.path).data.publicUrl; }
                catch (_) { return null; }
            }
            return getCloudinaryDeliveryUrl(doc, { download: false });
        }

        /** رابط التنزيل — مختلف تماماً عن رابط الفتح */
        function getDocumentDownloadUrl(doc) {
            if (doc.source === 'github') return getGithubFileUrl(doc);
            if (doc.source === 'supabase') {
                try { return supabaseClient.storage.from('pdf-files').getPublicUrl(doc.path, { download: true }).data.publicUrl; }
                catch (_) { return getDocumentOpenUrl(doc); }
            }
            return getCloudinaryDeliveryUrl(doc, { download: true });
        }

        /** رابط العارض — يعتمد على الصيغة الفعلية المخزنة، وليس امتداد الملف الأصلي.
         * الصور تُحوّل أثناء الرفع إلى PDF، لذلك original_name قد يبقى .jpg/.png
         * بينما name يصبح .pdf. يجب أن يستخدم العارض name حتى يُفتح الـPDF داخل المنصة.
         */
        function getPdfViewerUrl(doc) {
            const fileUrl = getDocumentOpenUrl(doc);
            if (!fileUrl) return null;
            const abs = absoluteUrl(fileUrl);

            const storedName = String(doc.name || '').trim();
            const originalName = String(doc.original_name || '').trim();
            const isStoredPdf = /\.pdf$/i.test(storedName) || String(doc.mime_type || '').toLowerCase() === 'application/pdf';
            const viewerName = isStoredPdf ? storedName : (originalName || storedName);

            // PDF الحقيقي، بما فيه PDF الناتج من صورة، يستخدم Google PDF Viewer داخل المنصة.
            if (isStoredPdf) {
                return `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(abs)}`;
            }

            // Office ← عارض Microsoft، الصور غير المحولة ← عرض مباشر.
            if (window.UNEMUpload) return window.UNEMUpload.viewerUrlFor(viewerName, abs);
            return `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(abs)}`;
        }

        function logDocumentError(context, doc, err) {
            console.error(context, {
                id: doc && doc.id,
                source: doc && doc.source,
                cloudinary_public_id: doc && doc.cloudinary_public_id,
                cloudinary_url: doc && doc.cloudinary_url,
                github_url: doc && doc.github_url,
                subject_code: doc && doc.subject_code,
                error: err
            });
        }

        /** التنزيل فقط — لا يفتح العارض أبداً */
        async function triggerDownload(fileObj) {
            const safeName = String(fileObj.name || 'document.pdf').replace(/^"|"$/g, '');
            if(typeof gtag === 'function') gtag('event', 'download_file', { 'file_name': safeName });
            logSupabaseAnalytics('تحميل ملف', safeName);

            if (fileObj.source === 'cloudinary' && !isRealCloudinaryUrl(fileObj.cloudinary_url)) {
                await ensureCloudinaryCloudName();
            }
            const downloadUrl = getDocumentDownloadUrl(fileObj);
            if (!downloadUrl) {
                logDocumentError('triggerDownload: رابط غير متوفر', fileObj);
                alert('❌ تعذر تحديد رابط تحميل هذا الملف.');
                return;
            }

            // [UNEM] تنزيل موقّع: يُجلب الملف ويُوقَّع بنفس توقيع الرفع (PDF/Word/PowerPoint) ثم يُحفظ.
            // عند أي فشل نكمل بالسلوك القديم أدناه فلا يتعطل التنزيل أبداً.
            try {
                if (window.UNEMFiles && await window.UNEMFiles.signedDownload(fileObj, safeName)) return;
            } catch (e) { console.warn('[UNEM] signed download fallback', e); }

            // Android يتعامل مع التنزيلات عبر طبقة أصلية تفحص محتوى الملف
            // وتصحح الامتداد الحقيقي (PDF/ZIP/Office/صور) بدل الاعتماد على امتداد الرابط.
            if (window.AndroidFileDownload && typeof window.AndroidFileDownload.downloadUrl === 'function') {
                window.AndroidFileDownload.downloadUrl(
                    downloadUrl,
                    safeName,
                    String(fileObj.mime_type || fileObj.mimeType || '')
                );
                return;
            }

            const link = document.createElement('a');
            link.href = downloadUrl;
            link.rel = 'noopener';
            link.download = /\.[A-Za-z0-9]+$/.test(safeName) ? safeName : `${safeName}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }



        // دالة العرض الفوري (بدون انتظار)
        function loadFiles(subjectName) {
            document.getElementById('selected-subject-name').textContent = subjectName; 
            document.getElementById('selected-subject-title-card').textContent = subjectName;
            
            const cleanSubject = normalizeText(subjectName); 
            
            // إظهار الواجهة فوراً للمستخدم بدون أي تأخير
            if (cleanSubject.includes("archive") && cleanSubject.match(/s[1-6]/)) { 
                isArchiveSpecialCase = true; 
                hideAll(); 
                document.getElementById('file-list-container').classList.remove('hidden'); 
                document.getElementById('file-list-back-btn').setAttribute('onclick', 'goBackToSubjects()'); 
                document.getElementById('pdf-list').innerHTML = ""; 
                document.getElementById('loading-spinner').classList.remove('hidden'); 
                document.getElementById('no-files-msg').classList.add('hidden');
            } else { 
                isArchiveSpecialCase = false; 
                hideAll(); 
                document.getElementById('category-selection-container').classList.remove('hidden'); 
                document.getElementById('file-list-back-btn').setAttribute('onclick', 'goBackToCategories()'); 
                applySubjectCategoryGrid(subjectName);
            }
            
            // بدء جلب الملفات في الخلفية بصمت
            currentSubjectName = subjectName;
            currentSubjectFilesPromise = performFileFetching(subjectName, cleanSubject);
            
            // إذا كان أرشيفاً، نعرض الملفات بمجرد انتهاء الوعد (لأنه لا توجد شاشة تصنيفات)
            if(isArchiveSpecialCase) {
                currentSubjectFilesPromise.then(() => {
                    document.getElementById('loading-spinner').classList.add('hidden');
                    renderFilteredFiles();
                });
            }
        }

        /** شاشة التصنيفات: الأنواع الافتراضية + تخصيصات هذه المادة (+ أنواع الملفات الموجودة فعلاً) */
        async function applySubjectCategoryGrid(subjectName) {
            const scope = subjectScopeFor(currentSpecialization, currentLevel, currentSemester, subjectName);
            let subjectTypes = [];
            try {
                subjectTypes = await getEffectiveDocumentTypes(scope, false);
            } catch (e) {
                console.warn('subject category types', e);
                subjectTypes = fallbackEffectiveTypes();
            }
            renderCategoryGrid(mergeTypesFoundInFiles(subjectTypes));
            if (currentSubjectFilesPromise) {
                currentSubjectFilesPromise
                    .then(() => renderCategoryGrid(mergeTypesFoundInFiles(subjectTypes)))
                    .catch(() => {});
            }
        }

        /** يضيف الأنواع التي تحتوي ملفات فعلية حتى لا يختفي أي ملف قديم */
        function mergeTypesFoundInFiles(subjectTypes) {
            const out = (subjectTypes || []).slice();
            const seen = new Set(out.map(t => typeSlug(t.slug || t.name)));
            (currentSubjectFiles || []).forEach(f => {
                const slug = getDocumentCategory(f);
                if (!slug || seen.has(slug)) return;
                const known = documentTypes.find(t => typeSlug(t.slug || t.name) === slug);
                out.push(known || { id: null, name: slug, slug: slug });
                seen.add(slug);
            });
            return out;
        }

        function documentsCacheKey(subjectName) {
            return `${currentSpecialization}|${currentLevel}|${currentSemester}|${getSafeSubjectCode(subjectName)}`;
        }
        function invalidateDocumentsCache(subjectName) {
            if (!subjectName) { documentsCache = {}; return; }
            delete documentsCache[documentsCacheKey(subjectName)];
        }

        /** يحوّل سجل قاعدة البيانات إلى شكل مستند موحّد (نفس الشكل لكل المصادر) */
        function mapDocumentRow(row) {
            const source = (row.source || 'cloudinary').toLowerCase();
            const doc = {
                id: row.id,
                sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 100000,
                name: row.name || row.original_name,
                original_name: row.original_name || row.name,
                type: 'file',
                source: source,
                subject: row.subject || '',
                subject_code: row.subject_code || '',
                specialization: row.specialization || '',
                level: row.level || '',
                semester: row.semester || '',
                file_type: row.file_type || null,
                fileType: row.file_type || null,
                github_url: row.github_url || null,
                github_path: row.github_path || null,
                cloudinary_url: row.cloudinary_url || null,
                cloudinary_public_id: row.cloudinary_public_id || null,
                cloudinary_resource_type: row.cloudinary_resource_type || 'raw',
                mime_type: row.mime_type || '',
                publicId: row.cloudinary_public_id || null,
                resourceType: row.cloudinary_resource_type || 'raw',
                path: row.github_path || (row.folder ? `${row.folder}/${row.name}` : row.name)
            };
            doc.openUrl = getDocumentOpenUrl(doc);
            doc.downloadUrl = getDocumentDownloadUrl(doc);
            return doc;
        }

        /** يحوّل ملف GitHub (من واجهة GitHub API) إلى نفس الشكل الموحّد */
        function mapGithubFile(file, subjectName) {
            const doc = {
                id: null,
                name: file.name,
                original_name: file.name,
                type: 'file',
                source: 'github',
                subject: subjectName || '',
                subject_code: getSafeSubjectCode(subjectName || ''),
                specialization: currentSpecialization || '',
                level: currentLevel || '',
                semester: currentSemester || '',
                file_type: null,
                fileType: null,
                github_url: file.download_url || null,
                github_path: file.path || file.name,
                cloudinary_url: null,
                cloudinary_public_id: null,
                cloudinary_resource_type: null,
                branch: currentBranch,
                path: file.path || file.name
            };
            doc.openUrl = getDocumentOpenUrl(doc);
            doc.downloadUrl = getDocumentDownloadUrl(doc);
            return doc;
        }

        /** مستندات قاعدة البيانات (Cloudinary أساساً + أي سجلات GitHub مسجَّلة) */
        async function fetchDatabaseDocs(subjectName) {
            if (!supabaseClient || !currentSpecialization || !currentLevel || !currentSemester) return [];
            const key = documentsCacheKey(subjectName);
            const cached = documentsCache[key];
            if (cached && (Date.now() - cached.time) < DOCUMENTS_CACHE_TTL) return cached.items;
            await ensureCloudinaryCloudName();
            const caseVariants = (v) => Array.from(new Set([String(v), String(v).toUpperCase(), String(v).toLowerCase()]));
            const wanted = documentCodeVariants(currentSpecialization, currentLevel, subjectName).map(c => c.toLowerCase());
            // مادة مشتركة بين تخصصات محددة؟ (تعيد [] لباقي المواد فيبقى السلوك القديم كما هو)
            const sharedTargets = sharedTargetsFor(currentSpecialization, currentLevel, currentSemester, subjectName);
            const specVariants = sharedTargets.length
                ? Array.from(new Set(sharedTargets.flatMap(t => caseVariants(t.spec))))
                : caseVariants(storageSpecializationFor(currentSpecialization));
            const semVariants = sharedTargets.length
                ? Array.from(new Set(sharedTargets.flatMap(t => caseVariants(t.semester))))
                : caseVariants(currentSemester);
            try {
                // المفتاح الأساسي: التخصص + الفصل (الفصل يحدد المستوى حتماً: S1/S2→L1 ...)
                // نتسامح مع سجلات قديمة حُفظ فيها level خاطئ أو فارغ، دون كسر أي بيانات.
                const { data, error } = await supabaseClient
                    .from('documents')
                    .select('id,name,original_name,source,cloudinary_url,cloudinary_public_id,cloudinary_resource_type,mime_type,folder,storage_path,file_type,subject,subject_code,specialization,level,semester,status,sort_order,created_at')
                    .in('specialization', specVariants.concat(['COMMON', 'common']))
                    .in('semester', semVariants)
                    .order('sort_order', { ascending: true, nullsFirst: false })
                    .order('created_at', { ascending: false });
                if (error) throw error;
                const masterContext = isMasterCycle(currentSpecialization, currentLevel);
                const expectedLevel = levelForSemester(currentSemester) || String(currentLevel || '').toUpperCase();
                const strictMasterCode = String(masterStorageCode(subjectName)).toLowerCase();
                const mapped = (data || [])
                    .filter(r => !r.status || r.status === 'active')
                    .filter(r => {
                        const lvl = String(r.level || '').toUpperCase();
                        if (!masterContext && sharedTargets.length) return true; // يُفحص لكل عضو في المجموعة بالأسفل
                        return masterContext ? lvl === expectedLevel : (!lvl || lvl === expectedLevel);
                    })
                    .filter(r => {
                        const code = String(r.subject_code || '').toLowerCase();
                        if (!masterContext && sharedTargets.length) return sharedTargets.some(t => rowMatchesSharedTarget(r, t));
                        if (masterContext) return code === strictMasterCode;
                        if (code) return wanted.includes(code) && !/^m_/.test(code);
                        return !!r.subject && wanted.includes(getSafeSubjectCode(r.subject));
                    })
                    .map(mapDocumentRow);
                documentsCache[key] = { time: Date.now(), items: mapped };
                return mapped;

            } catch (err) {
                console.error('fetchDatabaseDocs', err);
                return [];
            }
        }

        /** يعيد تحميل ملفات المادة الحالية فوراً بعد الرفع (بدون أي إعادة تحميل للصفحة) */
        async function refreshCurrentSubjectFiles() {
            if (!currentSubjectName) { invalidateDocumentsCache(); return; }
            invalidateDocumentsCache(currentSubjectName);
            try { await fetchFilesFromGitHub(currentBranch, { force: true }); } catch (_) {}
            currentSubjectFilesPromise = performFileFetching(currentSubjectName, normalizeText(currentSubjectName));
            await currentSubjectFilesPromise;
            const listVisible = !document.getElementById('file-list-container').classList.contains('hidden');
            if (listVisible) renderFilteredFiles();
        }



     /** يجمع كل المستندات (GitHub + Cloudinary + Supabase) في قائمة واحدة موحّدة */
     async function fetchAllDocuments(subjectName, cleanSubject) {
            return performFileFetching(subjectName, cleanSubject);
     }

        /** فلتر ملفات GitHub لمادة محددة (نفس المنطق الأصلي حرفياً) — يُستعمل للمادة الحالية ولأعضاء المجموعة المشتركة */
        function githubFileMatchesSubject(file, cleanSubject, archiveCase) {
            // السماح لرموز # و + بالبقاء في اسم المادة
            const sanitizedSubject = cleanSubject.replace(/[^a-z0-9#+]/g, ' ').replace(/\s+/g, ' ').trim();
            const subjectKeywords = sanitizedSubject.split(' ');
                if(file.type !== "file" || !isValidFile(file.name)) return false; 
                const fName = normalizeText(file.name); 
                const sanitizedFile = fName.replace(/[^a-z0-9#+]/g, ' ').replace(/\s+/g, ' ').trim();

                if (archiveCase) {
                    if (!fName.includes("archive")) return false;
                    if (cleanSubject.includes("s1")) return (fName.includes("s1") || fName.includes("semestre 1")) && !fName.includes("s2") && !fName.includes("s3") && !fName.includes("s4");
                    if (cleanSubject.includes("s2")) return (fName.includes("s2") || fName.includes("semestre 2")) && !fName.includes("s1") && !fName.includes("s3") && !fName.includes("s4");
                    if (cleanSubject.includes("s3")) return (fName.includes("s3") || fName.includes("semestre 3")) && !fName.includes("s1") && !fName.includes("s2") && !fName.includes("s4");
                    if (cleanSubject.includes("s4")) return (fName.includes("s4") || fName.includes("semestre 4")) && !fName.includes("s3") && !fName.includes("s5");
                    if (cleanSubject.includes("s5")) return (fName.includes("s5") || fName.includes("semestre 5")) && !fName.includes("s4") && !fName.includes("s6");
                    if (cleanSubject.includes("s6")) return (fName.includes("s6") || fName.includes("semestre 6")) && !fName.includes("s5");
                    return false;
                }
                if (fName.startsWith("archive s")) return false;

                // حل مشكلة مادة C# و Langage C
                if (cleanSubject === 'c#') return sanitizedFile.includes('c#') || sanitizedFile.includes('c sharp');
                if (cleanSubject === 'langage c') return fName.includes('langage') && fName.match(/\bc\b/) && !fName.includes('sql') && !fName.includes('base de donnee') && !sanitizedFile.includes('c#');

                const subRom = sanitizedSubject.match(/\b(i|ii|iii|iv|v|vi)\b/)?.[0]; const fileRom = sanitizedFile.match(/\b(i|ii|iii|iv|v|vi)\b/)?.[0];
                if (subRom) { if (fileRom !== subRom) return false; } else { if (fileRom) return false; }

                const stopWords =['de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'a', 'au', 'aux', 'l', 'd', 'pour', 'sur', 'dans'];
                const distinctKeywords = subjectKeywords.filter(w => !stopWords.includes(w) && w.length > 1);

                if (distinctKeywords.length > 0) {
                    const baseKeywords = distinctKeywords.map(w => w.endsWith('s') ? w.slice(0, -1) : w);
                    if (!baseKeywords.every(k => sanitizedFile.includes(k)) || !new RegExp(baseKeywords.join('.{0,35}')).test(sanitizedFile)) return false;
                    
                    // قائمة الممنوعات لضمان عدم تسرب أي ملفات لمادة أخرى
                    for (let word of ['assurance', 'approfondie', 'bancaire', 'international', 'internationale', 'islamique', 'portefeuille', 'tresorerie', 'patrimoine', 'financiere', 'financieres', 'commerciale', 'commerciales', 'descriptive', 'appliquee', 'analytique', 'nationale', 'statistique', 'c#', 'java', 'web', 'python', 'php', 'reseaux']) {
                        if (sanitizedFile.includes(word) && !sanitizedSubject.includes(word)) return false;
                    }
                    return true;
                }
                return sanitizedFile.includes(sanitizedSubject);
        }

     async function performFileFetching(subjectName, cleanSubject) {
            // السماح لرموز # و + بالبقاء في اسم المادة
            const sanitizedSubject = cleanSubject.replace(/[^a-z0-9#+]/g, ' ').replace(/\s+/g, ' ').trim(); 
            const subjectKeywords = sanitizedSubject.split(' ');
            // مادة مشتركة بين تخصصات محددة؟ ([] لباقي المواد → السلوك القديم كما هو)
            const sharedTargets = sharedTargetsFor(currentSpecialization, currentLevel, currentSemester, subjectName);
            
            if(allFiles.length === 0) await fetchFilesFromGitHub(currentBranch);
            
            let githubFiles = allFiles.map(f => ({...f, source: 'github'}));
            // GitHub لا يملك حقول cycle/subject_code؛ لا نستخدمه للماستر إلا لمسار معلن صراحةً.
            if (isMasterCycle(currentSpecialization, currentLevel)) {
                githubFiles = githubFiles.filter(isExplicitMasterGithubFile);
            }
            
            let supabaseFiles = [];
            
            // مستندات قاعدة البيانات (Cloudinary + أي سجلات GitHub مسجّلة)
            const dbFiles = await fetchDatabaseDocs(subjectName);

            if(supabaseClient && currentSpecialization && currentLevel && currentSemester) {
                const storageSpec = storageSpecializationFor(currentSpecialization);
                const storageLevel = storageLevelFor(currentSpecialization, currentLevel);
                const base = `${storageSpec.toUpperCase()}/${storageLevel.toUpperCase()}/${currentSemester.toUpperCase()}`;
                for (const code of documentCodeVariants(currentSpecialization, currentLevel, subjectName)) {
                    const folderPath = `${base}/${code}`;
                    const { data } = await supabaseClient.storage.from('pdf-files').list(folderPath);
                    if (data && data.length > 0) {
                        supabaseFiles = supabaseFiles.concat(
                            data.filter(f => isValidFile(f.name)).map(f => ({
                                id: null, name: f.name, original_name: f.name, type: 'file', source: 'supabase',
                                subject: subjectName, subject_code: getSafeSubjectCode(subjectName),
                                file_type: null, fileType: null,
                                github_url: null, github_path: null,
                                cloudinary_url: null, cloudinary_public_id: null, cloudinary_resource_type: null,
                                path: `${folderPath}/${f.name}`
                            }))
                        );
                    }
                }
                // مادة مشتركة: ملفات Supabase Storage لبقية أعضاء المجموعة
                for (const t of sharedTargets.filter(x => !x.isSelf)) {
                    const tBase = `${t.spec}/${t.level}/${t.semester}`;
                    for (const code of subjectCodeVariants(t.name)) {
                        const folderPath = `${tBase}/${code}`;
                        const { data } = await supabaseClient.storage.from('pdf-files').list(folderPath);
                        if (data && data.length > 0) {
                            supabaseFiles = supabaseFiles.concat(
                                data.filter(f => isValidFile(f.name)).map(f => ({
                                    id: null, name: f.name, original_name: f.name, type: 'file', source: 'supabase',
                                    subject: t.name, subject_code: getSafeSubjectCode(t.name),
                                    specialization: t.spec, level: t.level, semester: t.semester,
                                    file_type: null, fileType: null,
                                    github_url: null, github_path: null,
                                    cloudinary_url: null, cloudinary_public_id: null, cloudinary_resource_type: null,
                                    path: `${folderPath}/${f.name}`
                                }))
                            );
                        }
                    }
                }
                supabaseFiles.forEach(d => { d.openUrl = getDocumentOpenUrl(d); d.downloadUrl = getDocumentDownloadUrl(d); });
            }


            // الفلترة الذكية الجديدة
            const filteredGithub = githubFiles.filter(file => githubFileMatchesSubject(file, cleanSubject, isArchiveSpecialCase));
   

            // توحيد شكل ملفات GitHub ثم دمج كل المصادر في قائمة واحدة
            const githubDocs = filteredGithub.map(f => mapGithubFile(f, subjectName));
            // مادة مشتركة: ملفات GitHub الموجودة في فروع بقية أعضاء المجموعة (بدون نسخ أي شيء)
            for (const t of sharedTargets.filter(x => !x.isSelf)) {
                try {
                    const branchFiles = await fetchBranchFilesQuiet(t.branch);
                    const tClean = normalizeText(t.name);
                    const tArchive = tClean.includes('archive') && !!tClean.match(/s[1-6]/);
                    branchFiles
                        .map(f => ({ ...f, source: 'github' }))
                        .filter(f => githubFileMatchesSubject(f, tClean, tArchive))
                        .forEach(f => {
                            const d = mapGithubFile(f, t.name);
                            d.branch = t.branch; d.specialization = t.spec; d.level = t.level; d.semester = t.semester;
                            githubDocs.push(d);
                        });
                } catch (e) { console.warn('shared github branch', t.branch, e); }
            }
            // دمج كل المصادر مع منع التكرار، ثم تطبيق حارس النطاق النهائي على كل مصدر.
            const seen = new Set();
            const seenNames = new Map();
            const sharedMode = sharedTargets.length > 0;
            currentSubjectFiles = [...dbFiles, ...githubDocs, ...supabaseFiles].filter(isDocumentInCurrentScope).filter(d => {
                let key = `${(d.github_path || d.cloudinary_public_id || d.path || d.name || '')}`.toLowerCase();
                if (!key) return true;
                // مادة مشتركة: نفس المسار في فرعين مختلفين ليس ملفاً مكرراً بالضرورة
                if (sharedMode && d.source === 'github') key = `${sharedDocOrigin(d)}|${key}`;
                if (seen.has(key)) return false;
                seen.add(key);
                if (sharedMode) {
                    // نفس الملف (الاسم + النوع) موجود عند أكثر من تخصص في المجموعة → يظهر مرة واحدة فقط
                    const nameKey = `${normalizeText(String(d.name || d.original_name || ''))}|${getDocumentCategory(d)}`;
                    const origin = sharedDocOrigin(d);
                    if (seenNames.has(nameKey) && seenNames.get(nameKey) !== origin) return false;
                    if (!seenNames.has(nameKey)) seenNames.set(nameKey, origin);
                }
                return true;
            });
            return currentSubjectFiles;
        }

        function absoluteUrl(url) {
            try { return new URL(url, window.location.origin).href; } catch (_) { return url; }
        }

        /** لوحة البدائل — لا تبدأ أي تنزيل تلقائي */
        function showViewerFallback(fileObj, reason) {
            const area = document.getElementById('pdf-render-area');
            const msg = document.getElementById('rendering-msg');
            if (msg) msg.style.display = 'none';
            if (!area) return;
            const old = document.getElementById('viewer-fallback-panel');
            if (old) old.remove();

            const panel = document.createElement('div');
            panel.id = 'viewer-fallback-panel';
            panel.style.cssText = 'position:absolute; inset:auto 0 0 0; background:rgba(15,23,42,0.94); color:#fff; padding:14px; display:flex; flex-wrap:wrap; gap:10px; justify-content:center; align-items:center; font-weight:700; z-index:5;';
            const label = document.createElement('span');
            label.style.cssText = 'width:100%; text-align:center; font-size:0.9rem; font-weight:800;';
            label.textContent = reason || 'تعذر عرض الملف داخل العارض.';
            panel.appendChild(label);

            const mk = (text, handler) => {
                const b = document.createElement('button');
                b.textContent = text;
                b.style.cssText = 'background:#2563eb; color:#fff; border:none; padding:10px 16px; border-radius:50px; font-weight:800; cursor:pointer;';
                b.onclick = (e) => { e.stopPropagation(); handler(); };
                panel.appendChild(b);
            };
            mk('فتح مباشرة', () => {
                const direct = getDocumentOpenUrl(fileObj);
                if (direct) window.open(absoluteUrl(direct), '_blank', 'noopener');
            });
            mk('تحميل', () => triggerDownload(fileObj));
            mk('إعادة المحاولة', () => openSmartViewer(fileObj));
            area.appendChild(panel);
        }