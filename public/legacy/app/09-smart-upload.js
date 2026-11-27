/* تصنيف ذكي لملفات الأرشيف الدراسي — تتم قراءة الملفات محلياً داخل المتصفح. */
(function () {
  "use strict";
  var ocrPromise = null,
    ocrWorkerPromise = null;
  var normalize = function (s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[أإآ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/[\u064b-\u065f\u0670\u0640]/g, "")
      .replace(/[٠-٩]/g, function (d) {
        return String("٠١٢٣٤٥٦٧٨٩".indexOf(d));
      })
      .toUpperCase()
      .replace(/[^A-Z0-9\u0600-\u06ff]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  };
  function getQueue() {
    try {
      return typeof uploadQueue !== "undefined" ? uploadQueue : [];
    } catch (_) {
      return [];
    }
  }
  function status(text, isError) {
    var el = document.getElementById("upload-smart-status");
    if (!el) return;
    el.textContent = text || "";
    el.className = "status-msg" + (isError ? " error" : "");
    el.style.display = text ? "block" : "none";
  }
  function loadOcr() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (ocrPromise) return ocrPromise;
    ocrPromise = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
      s.onload = function () {
        window.Tesseract ? resolve(window.Tesseract) : reject(new Error("تعذر تحميل OCR"));
      };
      s.onerror = function () {
        ocrPromise = null;
        reject(new Error("تعذر تحميل مكتبة قراءة الصور"));
      };
      document.head.appendChild(s);
    });
    return ocrPromise;
  }
  async function extractPdf(file) {
    if (!window.pdfjsLib) {
      await new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        s.onload = resolve;
        s.onerror = function () {
          reject(new Error("تعذر تحميل قارئ PDF"));
        };
        document.head.appendChild(s);
      });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
    var pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
      .promise;
    var out = [];
    for (var p = 1; p <= Math.min(pdf.numPages, 3); p++) {
      var page = await pdf.getPage(p),
        content = await page.getTextContent();
      out.push(
        content.items
          .map(function (x) {
            return x.str || "";
          })
          .join(" "),
      );
    }
    if (out.join(" ").trim().length < 35 && pdf.numPages) {
      for (var scanNo = 1; scanNo <= Math.min(pdf.numPages, 3); scanNo++) {
        var scanPage = await pdf.getPage(scanNo),
          viewport = scanPage.getViewport({ scale: 1.7 });
        var canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await scanPage.render({ canvasContext: canvas.getContext("2d"), viewport: viewport })
          .promise;
        out.push(await extractImage(canvas));
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    return out.join("\n");
  }
  async function extractImage(file) {
    var T = await loadOcr();
    if (!ocrWorkerPromise)
      ocrWorkerPromise = T.createWorker("eng+fra+ara", 1, {
        workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js",
        corePath:
          "https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core-simd-lstm.wasm.js",
        langPath: "https://tessdata.projectnaptha.com/4.0.0",
        logger: function (m) {
          if (m.status === "recognizing text")
            status(
              "يُحلّل النص الظاهر في الصورة محلياً… " + Math.round((m.progress || 0) * 100) + "%",
            );
        },
      }).catch(function (e) {
        ocrWorkerPromise = null;
        throw e;
      });
    var worker = await ocrWorkerPromise,
      result = await worker.recognize(file);
    return result.data.text || "";
  }
  async function extractOffice(file, ext) {
    if (!window.JSZip)
      await new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = "https://unpkg.com/jszip@3.10.1/dist/jszip.min.js";
        s.onload = resolve;
        s.onerror = function () {
          reject(new Error("تعذر تحميل قارئ Office"));
        };
        document.head.appendChild(s);
      });
    var zip = await window.JSZip.loadAsync(await file.arrayBuffer()),
      names = [];
    if (ext === "docx") names = ["word/document.xml"];
    else if (ext === "pptx")
      names = Object.keys(zip.files)
        .filter(function (n) {
          return /^ppt\/slides\/slide\d+\.xml$/.test(n);
        })
        .sort()
        .slice(0, 3);
    else if (ext === "xlsx")
      names = ["xl/sharedStrings.xml"].concat(
        Object.keys(zip.files)
          .filter(function (n) {
            return /^xl\/worksheets\/sheet\d+\.xml$/.test(n);
          })
          .sort()
          .slice(0, 2),
      );
    var strings = [];
    for (var i = 0; i < names.length; i++) {
      var entry = zip.file(names[i]);
      if (!entry) continue;
      var xml = await entry.async("string"),
        doc = new DOMParser().parseFromString(xml, "application/xml");
      Array.prototype.forEach.call(doc.getElementsByTagName("t"), function (node) {
        if (node.textContent) strings.push(node.textContent);
      });
    }
    return strings.join(" ");
  }
  function inferType(text) {
    var x = normalize(text);
    if (
      /\b(EXAMEN|EXAM|RATTRAPAGE|SESSION NORMALE|SESSION DE REMPLACEMENT)\b/.test(x) ||
      /امتحان|اختبار|دورة عاديه|استدراكي/.test(x)
    )
      return "examen";
    if (
      /\b(DEVOIR|INTERROGATION|INTERRO|CONTROLE CONTINU|CONTROLE)\b/.test(x) ||
      /واجب|فرض|مراقبه مستمره/.test(x)
    )
      return "devoir";
    if (/\b(TRAVAUX? DIRIGES?|T D|TD)\b/.test(x) || /اعمال موجهه|اعمال توجيهيه/.test(x))
      return "td";
    if (/\b(TRAVAUX? PRATIQUES?|T P|TP|PRATIQUE)\b/.test(x) || /اعمال تطبيقيه|تطبيقي/.test(x))
      return "tp";
    return "cours";
  }
  function inferSpec(text) {
    var t = normalize(text),
      m;
    m = t.match(
      /(?:FILIERE|SPECIALITE|SPECIALISATION|PARCOURS)\s*[:\-]?\s*(?:(?:LICENCE|MASTER)\s*)?(?:[123]\s*)?(MASTER\s*FC|MASTER\s*IG|FC|IG|BA|TCM|GRH|SAE)\b/,
    );
    if (!m) m = t.match(/\b(MASTER\s*FC|MASTER\s*IG)\b/);
    if (!m && !/ماستر/.test(t)) m = t.match(/\b(FC|IG|BA|TCM|GRH|SAE)\b/);
    if (!m) {
      if (/ماستر.*(?:ماليه.*محاسبه|محاسبه.*ماليه)/.test(t)) return "MASTER_FC";
      if (/ماستر.*(?:معلوماتيه.*تسيير|اعلام.*تسيير)/.test(t)) return "MASTER_IG";
      if (/البنوك.*تامين|تامين.*البنوك/.test(t)) return "BA";
      if (/تقنيات.*(?:بيع|مبيعات|تسويق)|تجاره.*تسويق/.test(t)) return "TCM";
      if (/اداره.*(?:موارد.*بشريه|الموارد البشريه)|تسيير.*موارد.*بشريه/.test(t)) return "GRH";
      if (/احصاء.*تطبيقي.*اقتصاد/.test(t)) return "SAE";
      if (/معلوماتيه.*تسيير|المعلوماتيه المطبقه على التسيير/.test(t)) return "IG";
      if (/ماليه.*محاسبه|محاسبه.*ماليه/.test(t)) return "FC";
      return "";
    }
    var v = m[1].replace(/\s+/g, "_");
    return v.indexOf("MASTER_") === 0 ? v : v;
  }
  function inferLevel(text) {
    var t = normalize(text),
      m = t.match(/\b(M[12]|L[123])\b/);
    if (m) return m[1];
    m =
      t.match(/\b(?:LICENCE|LICENSE|LICENCIAT?URE)\s*([123])\b/) ||
      t.match(/\b(?:ANNEE|YEAR|NIVEAU|LEVEL)\s*([123])\b/);
    if (m) return "L" + m[1];
    m = t.match(
      /(?:السنه|سنه|المستوي|مستوي)\s*(?:ال)?(الاولي|الاول|الثانيه|الثاني|الثالثه|الثالث|[123])/,
    );
    if (m)
      return /^(?:الاولي|الاول|1)$/.test(m[1])
        ? "L1"
        : /^(?:الثانيه|الثاني|2)$/.test(m[1])
          ? "L2"
          : "L3";
    m = t.match(/\b(?:LICENCE|LICENSE)\s*([123])\b/);
    if (m) return "L" + m[1];
    m = t.match(
      /(?:FILIERE|NIVEAU|LEVEL|ANNEE|ANNEE D ETUDE)\s*[:\-]?\s*([123])\s*(?:ERE|ER|EME|E)?\b/,
    );
    return m ? "L" + m[1] : "";
  }
  function inferSemester(text) {
    var t = normalize(text),
      m = t.match(/\bS\s*([1-6])\b/) || t.match(/\bSEMESTRE\s*(?:N\s*)?([1-6])\b/);
    if (m) return "S" + m[1];
    m = t.match(
      /الفصل\s*(?:الدراسي\s*)?(?:ال)?(اول|اولي|ثاني|ثانيه|ثالث|ثالثه|رابع|رابعه|خامس|خامسه|سادس|سادسه|[1-6])/,
    );
    if (m)
      return (
        {
          اول: "S1",
          اولي: "S1",
          ثاني: "S2",
          ثانيه: "S2",
          ثالث: "S3",
          ثالثه: "S3",
          رابع: "S4",
          رابعه: "S4",
          خامس: "S5",
          خامسه: "S5",
          سادس: "S6",
          سادسه: "S6",
          1: "S1",
          2: "S2",
          3: "S3",
          4: "S4",
          5: "S5",
          6: "S6",
        }[m[1]] || ""
      );
    m = t.match(
      /\bSEMESTRE\s+(PREMIER|PREMIERE|SECOND|DEUXIEME|TROISIEME|QUATRIEME|CINQUIEME|SIXIEME|I|II|III|IV|V|VI)\b/,
    );
    if (!m) return "";
    return (
      {
        PREMIER: "S1",
        PREMIERE: "S1",
        I: "S1",
        SECOND: "S2",
        DEUXIEME: "S2",
        II: "S2",
        TROISIEME: "S3",
        III: "S3",
        QUATRIEME: "S4",
        IV: "S4",
        CINQUIEME: "S5",
        V: "S5",
        SIXIEME: "S6",
        VI: "S6",
      }[m[1]] || ""
    );
  }
  function findSubject(text, spec, level, semester) {
    if (!spec || !level) return null;
    var expectedSem = inferSemester(text),
      semesters = typeof semestersForLevel === "function" ? semestersForLevel(level) : [];
    if (expectedSem && semesters.indexOf(expectedSem) < 0) return null;
    if (expectedSem && semesters.indexOf(expectedSem) >= 0)
      semesters = [expectedSem].concat(
        semesters.filter(function (s) {
          return s !== expectedSem;
        }),
      );
    var options = [];
    semesters.forEach(function (sem) {
      var names = [];
      try {
        names = subjectsForUpload(spec, level, sem).slice();
      } catch (_) {}
      try {
        commonSubjectsFor(sem).forEach(function (c) {
          names.push(c.name);
        });
      } catch (_) {}
      names.forEach(function (name) {
        if (name) options.push({ name: name, semester: sem });
      });
    });
    var hay = " " + normalize(text) + " ",
      matches = options
        .filter(function (o) {
          var n = normalize(o.name);
          return n.length >= 5 && hay.indexOf(" " + n + " ") >= 0;
        })
        .sort(function (a, b) {
          return normalize(b.name).length - normalize(a.name).length;
        });
    if (!matches.length) return null;
    if (
      !expectedSem &&
      matches.some(function (m) {
        return m.name === matches[0].name && m.semester !== matches[0].semester;
      })
    )
      return null;
    return matches[0];
  }
  function classify(text, fileName) {
    var full = String(fileName || "") + "\n" + String(text || ""),
      spec = inferSpec(full),
      level = inferLevel(full),
      semester = inferSemester(full);
    var subject = findSubject(full, spec, level, semester);
    if (subject) semester = subject.semester;
    return {
      spec: spec,
      level: level,
      semester: semester,
      subject: (subject && subject.name) || "",
      type: inferType(full),
      confidence: !!(spec && level && semester && subject),
    };
  }
  async function pdfFirstPageDataUrl(file) {
    if (!window.pdfjsLib) {
      await new Promise(function (resolve, reject) {
        var script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        script.onload = resolve; script.onerror = function () { reject(new Error("PDF.js unavailable")); };
        document.head.appendChild(script);
      });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
    var pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    var page = await pdf.getPage(1), base = page.getViewport({ scale: 1 });
    var viewport = page.getViewport({ scale: Math.min(2, 1800 / base.width) });
    var canvas = document.createElement("canvas"); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: viewport }).promise;
    return canvas.toDataURL("image/jpeg", 0.88);
  }
  async function askVision(file, extension) {
    var mime = "", dataUrl = "";
    if (/^(jpe?g|png|webp)$/.test(extension)) {
      // Android/Samsung may report image/jpg or an empty MIME for a .jpg file.
      // Derive the canonical MIME from the extension so vision is never skipped silently.
      mime = /^(jpe?g)$/.test(extension) ? "image/jpeg" : extension === "png" ? "image/png" : "image/webp";
      dataUrl = await new Promise(function (resolve, reject) { var r = new FileReader(); r.onload = function () { resolve(String(r.result || "").replace(/^data:[^;,]+;/, "data:" + mime + ";")); }; r.onerror = reject; r.readAsDataURL(file); });
    } else if (extension === "pdf") { dataUrl = await pdfFirstPageDataUrl(file); mime = "image/jpeg"; }
    else return null;
    if (dataUrl.length > 8 * 1024 * 1024) throw new Error("Image too large for classification");
    var token = typeof getAccessToken === "function" ? await getAccessToken() : "";
    if (!token) throw new Error("Authentication required");
    var apiUrl = typeof unemApi === "function" ? unemApi("/api/public/upload/classify") : "/api/public/upload/classify";
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 40000);
    var response;
    try {
      response = await fetch(apiUrl, { method: "POST", headers: { "content-type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ mime: mime, data: dataUrl }), signal: controller.signal });
    } catch (requestError) {
      if (controller.signal.aborted) throw new Error("انتهت مهلة الاتصال بمساعد التصنيف؛ تحقق من الإنترنت ثم أعد المحاولة.");
      throw requestError;
    } finally {
      clearTimeout(timeout);
    }
    var result = await response.json();
    if (!response.ok) throw new Error(result.error || "فشل طلب التحليل البصري (HTTP " + response.status + ").");
    if (result.error) throw new Error(result.error);
    if (typeof result.confidence !== "number") throw new Error("لم يُرجع المساعد درجة ثقة قابلة للاستخدام.");
    if (result.confidence < 0.75) throw new Error("لم يتعرّف المساعد على الورقة بثقة كافية؛ اختر البيانات يدوياً أو أعد المحاولة بصورة أوضح.");
    return result;
  }
  function analyzeQueuedFile(file) {
    var item = getQueue().find(function (q) {
      return q.file === file;
    });
    if (!item || item.state !== "pending") return Promise.resolve(null);
    if (item.smartPromise) return item.smartPromise;
    item.smartState = "working";
    item.smartMessage = "يجري التعرّف على بيانات الملف…";
    if (typeof renderUploadQueue === "function") renderUploadQueue();
    status("يحلّل النظام أسماء الملفات والنصوص لاكتشاف التصنيف تلقائياً.");
    item.smartPromise = (async function () {
      try {
        var ext = String(file.name || "")
            .split(".")
            .pop()
            .toLowerCase(),
          text = "";
        item.smart = classify("", file.name);
        // للصور نبدأ بالمساعد البصري مباشرة؛ OCR على بعض هواتف Android قد
        // يتأخر بعد وصول شريط التقدم إلى 100% ويمنع طلب التصنيف من البدء.
        if (!item.smart.confidence && /^(jpe?g|png|webp)$/.test(ext)) {
          try {
            status("يتصل المساعد الذكي لتحليل الصورة…");
            var imageResult = await askVision(file, ext);
            item.smart = { spec: imageResult.specialization, level: imageResult.level, semester: imageResult.semester, subject: imageResult.subject, type: imageResult.type === "td_tp" ? "td" : imageResult.type, confidence: true, aiConfidence: imageResult.confidence, source: "vision" };
          } catch (imageError) {
            item.smartError = imageError && imageError.message ? imageError.message : "تعذر الاتصال بالمساعد البصري.";
          }
        }
        if (!item.smart.confidence && ext === "pdf") {
          try {
            text = await extractPdf(file);
          } catch (e) {
            console.warn("smart upload PDF text", e);
          }
        } else if (!item.smart.confidence && /^(jpe?g|png|webp|bmp)$/.test(ext)) {
          try {
            text = await extractImage(file);
          } catch (e) {
            console.warn("smart upload OCR", e);
          }
        } else if (!item.smart.confidence && /^(docx|pptx|xlsx)$/.test(ext)) {
          try {
            text = await extractOffice(file, ext);
          } catch (e) {
            console.warn("smart upload Office text", e);
          }
        }
        if (!item.smart.confidence) {
          var localResult = classify(text, file.name);
          if (localResult.confidence) item.smart = localResult;
        }
        if (!item.smart.confidence && !item.smartError && ext === "pdf") {
          try {
            var visual = await askVision(file, ext);
            if (visual) item.smart = { spec: visual.specialization, level: visual.level, semester: visual.semester, subject: visual.subject, type: visual.type === "td_tp" ? "td" : visual.type, confidence: true, aiConfidence: visual.confidence, source: "vision" };
          } catch (visionError) {
            console.warn("smart upload vision fallback", visionError);
            item.smartError = visionError && visionError.message ? visionError.message : "تعذر الاتصال بالمساعد البصري.";
          }
        }
        item.smartState = item.smart.confidence ? "done" : "partial";
        item.smartMessage = item.smart.confidence
          ? "اقتراح" + (item.smart.source === "vision" ? " بصري" : "") + ": " +
            item.smart.type.toUpperCase() +
            " · " +
            item.smart.spec +
            " · " +
            item.smart.level +
            " · " +
            item.smart.semester +
            " · " +
            item.smart.subject
          : item.smartError
            ? "تعذر التحليل البصري: " + item.smartError + " اختر البيانات يدوياً أو أعد المحاولة."
            : "لم تكتمل القراءة التلقائية؛ اختر البيانات يدوياً أو أعد تسمية الملف باسم المادة والتخصص والفصل.";
      } catch (e) {
        item.smartState = "failed";
        item.smartMessage = "تعذّر التحليل الذكي؛ يمكنك متابعة الرفع بالاختيار اليدوي.";
      }
      if (typeof renderUploadQueue === "function") renderUploadQueue();
      return item.smart || null;
    })();
    return item.smartPromise;
  }
  async function prepareBatch() {
    var items = getQueue().filter(function (i) {
      return i.state === "pending";
    });
    await Promise.all(
      items.map(function (i) {
        return i.smartPromise || analyzeQueuedFile(i.file);
      }),
    );
    var detected = items.filter(function (i) {
      return i.smart && i.smart.confidence;
    });
    if (!detected.length) {
      status("لم يُستنتج تصنيف مؤكد. املأ الحقول يدوياً كما في السابق.", false);
      return true;
    }
    if (detected.length !== items.length) {
      status(
        "تعذّر تأكيد تصنيف كل الملفات المحددة. لتجنّب حفظ ملف في مادة خاطئة، تُركت الحقول كما هي؛ راجعها واختر التصنيف يدوياً أو ارفع الملفات المقروءة وحدها.",
        false,
      );
      return true;
    }
    // كل ملف يُرفع باستخدام بياناته المستقلة داخل معالج الرفع؛ لا نرفض دفعة متعددة المواد.
    var d = detected[0].smart;
    var specSel = document.getElementById("upload-spec");
    if (
      !specSel ||
      !Array.from(specSel.options).some(function (o) {
        return o.value === d.spec;
      })
    ) {
      status(
        "لم يتمكن النظام من مطابقة التخصص مع قائمة الموقع. راجع البيانات واخترها يدوياً.",
        true,
      );
      return true;
    }
    specSel.value = d.spec;
    if (typeof onUploadSpecChange === "function") onUploadSpecChange();
    var levelSel = document.getElementById("upload-level");
    if (levelSel) {
      levelSel.value = d.level;
      if (typeof onUploadLevelChange === "function") onUploadLevelChange();
    }
    var semSel = document.getElementById("upload-semester");
    if (semSel) {
      semSel.value = d.semester;
      if (typeof onUploadSemesterChange === "function") onUploadSemesterChange();
    }
    var subSel = document.getElementById("upload-subject");
    if (
      !subSel ||
      !Array.from(subSel.options).some(function (o) {
        return o.value === d.subject;
      })
    ) {
      status(
        "استُخرج اسم المادة لكن لم تتم مطابقته بدقة مع قائمة هذا التخصص والفصل؛ اختر المادة يدوياً قبل الرفع.",
        true,
      );
      return true;
    }
    subSel.value = d.subject;
    if (typeof refreshUploadTypeOptions === "function") await refreshUploadTypeOptions();
    var typeSel = document.getElementById("upload-type");
    var aliases = {
      examen: ["examen", "exam"],
      devoir: ["devoir", "assignment"],
      td: ["td_tp", "td", "travaux_diriges"],
      tp: ["td_tp", "tp", "travaux_pratiques"],
      cours: ["cours", "course", "lesson"],
    }[d.type] || [d.type];
    var typeOption =
      typeSel &&
      Array.from(typeSel.options).find(function (o) {
        return aliases.indexOf(String(o.value).toLowerCase()) >= 0;
      });
    if (typeSel && typeOption) typeSel.value = typeOption.value;
    else if (typeSel && typeSel.options.length > 1) {
      status(
        "تعذّر مطابقة النوع المكتشف مع قائمة أنواع هذه المادة؛ اختر النوع يدوياً قبل الرفع.",
        true,
      );
      return true;
    }
    status(
      "اقتراح آلي من محتوى الملفات: " +
        d.type.toUpperCase() +
        " · " +
        d.subject +
        " · " +
        d.spec +
        " · " +
        d.level +
        " · " +
        d.semester +
        ". راجع الاختيارات قبل بدء الرفع.",
    );
    return true;
  }
  window.UNEMSmartUpload = {
    analyzeQueuedFile: analyzeQueuedFile,
    retryAnalysis: function (file) {
      var item = getQueue().find(function (q) { return q.file === file; });
      if (!item || item.state !== "pending") return Promise.resolve(null);
      item.smartPromise = null;
      item.smart = null;
      item.smartError = "";
      item.smartState = "pending";
      item.smartMessage = "ستُعاد المحاولة بالمساعد الذكي…";
      return analyzeQueuedFile(file);
    },
    prepareBatch: prepareBatch,
    classify: classify,
  };
})();
