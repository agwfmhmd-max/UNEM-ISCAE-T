/* تصنيف ذكي لملفات الأرشيف الدراسي — تتم قراءة الملفات محلياً داخل المتصفح. */
(function () {
  "use strict";
  var ocrPromise = null,
    ocrWorkerPromise = null;
  var normalize = function (s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
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
      var scanPage = await pdf.getPage(1),
        viewport = scanPage.getViewport({ scale: 1.7 });
      var canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await scanPage.render({ canvasContext: canvas.getContext("2d"), viewport: viewport }).promise;
      out.push(await extractImage(canvas));
      canvas.width = 0;
      canvas.height = 0;
    }
    return out.join("\n");
  }
  async function extractImage(file) {
    var T = await loadOcr();
    if (!ocrWorkerPromise)
      ocrWorkerPromise = T.createWorker("eng+fra", 1, {
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
    if (/\b(EXAMEN|EXAM|RATTRAPAGE|SESSION NORMALE|SESSION DE REMPLACEMENT)\b/.test(x))
      return "examen";
    if (/\b(DEVOIR|INTERROGATION|INTERRO|CONTROLE CONTINU|CONTROLE)\b/.test(x)) return "devoir";
    if (/\b(TRAVAUX? DIRIGES?|T D|TD)\b/.test(x)) return "td";
    if (/\b(TRAVAUX? PRATIQUES?|T P|TP|PRATIQUE)\b/.test(x)) return "tp";
    return "cours";
  }
  function inferSpec(text) {
    var t = normalize(text),
      m;
    m = t.match(
      /(?:FILIERE|SPECIALITE|SPECIALISATION|PARCOURS)\s*[:\-]?\s*(?:(?:LICENCE|MASTER)\s*)?(?:[123]\s*)?(MASTER\s*FC|MASTER\s*IG|FC|IG|BA|TCM|GRH|SAE)\b/,
    );
    if (!m) m = t.match(/\b(MASTER\s*FC|MASTER\s*IG)\b/);
    if (!m) return "";
    var v = m[1].replace(/\s+/g, "_");
    return v.indexOf("MASTER_") === 0 ? v : v;
  }
  function inferLevel(text) {
    var t = normalize(text),
      m = t.match(/\b(M[12]|L[123])\b/);
    if (m) return m[1];
    m = t.match(
      /(?:FILIERE|NIVEAU|LEVEL|ANNEE|ANNEE D ETUDE)\s*[:\-]?\s*([123])\s*(?:ERE|ER|EME|E)?\b/,
    );
    return m ? "L" + m[1] : "";
  }
  function inferSemester(text) {
    var t = normalize(text),
      m = t.match(/\bS\s*([1-4])\b/) || t.match(/\bSEMESTRE\s*(?:N\s*)?([1-4])\b/);
    if (m) return "S" + m[1];
    m = t.match(
      /\bSEMESTRE\s+(PREMIER|PREMIERE|SECOND|DEUXIEME|TROISIEME|QUATRIEME|I|II|III|IV)\b/,
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
      }[m[1]] || ""
    );
  }
  function findSubject(text, spec, level, semester) {
    if (!spec || !level) return null;
    var expectedSem = inferSemester(text),
      semesters = typeof semestersForLevel === "function" ? semestersForLevel(level) : [];
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
        if (
          name &&
          !options.some(function (o) {
            return o.name === name;
          })
        )
          options.push({ name: name, semester: sem });
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
    return matches.length ? matches[0] : null;
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
        if (ext === "pdf") {
          try {
            text = await extractPdf(file);
          } catch (e) {
            console.warn("smart upload PDF text", e);
          }
        } else if (/^(jpe?g|png|webp|bmp)$/.test(ext)) {
          try {
            text = await extractImage(file);
          } catch (e) {
            console.warn("smart upload OCR", e);
          }
        } else if (/^(docx|pptx|xlsx)$/.test(ext)) {
          try {
            text = await extractOffice(file, ext);
          } catch (e) {
            console.warn("smart upload Office text", e);
          }
        }
        item.smart = classify(text, file.name);
        item.smartState = item.smart.confidence ? "done" : "partial";
        item.smartMessage = item.smart.confidence
          ? "اقتراح: " +
            item.smart.type.toUpperCase() +
            " · " +
            item.smart.spec +
            " · " +
            item.smart.level +
            " · " +
            item.smart.semester +
            " · " +
            item.smart.subject
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
    var signatures = new Set(
      detected.map(function (i) {
        var d = i.smart;
        return [d.spec, d.level, d.semester, d.subject, d.type].join("|");
      }),
    );
    if (signatures.size > 1) {
      status(
        "تبيّن أن الملفات المحددة لا تنتمي كلها إلى تصنيف واحد. ارفع كل مجموعة متجانسة على حدة لتجنّب حفظ ملف تحت مادة أو فصل خاطئ.",
        true,
      );
      return false;
    }
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
      return false;
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
      return false;
    }
    subSel.value = d.subject;
    if (typeof refreshUploadTypeOptions === "function") await refreshUploadTypeOptions();
    var typeSel = document.getElementById("upload-type");
    var aliases = {
      examen: ["examen", "exam"],
      devoir: ["devoir", "assignment"],
      td: ["td", "travaux_diriges"],
      tp: ["tp", "travaux_pratiques"],
      cours: ["cours", "course", "lesson"],
    }[d.type] || [d.type];
    var typeOption =
      typeSel &&
      Array.from(typeSel.options).find(function (o) {
        return aliases.indexOf(String(o.value).toLowerCase()) >= 0;
      });
    if (typeSel && typeOption) typeSel.value = typeOption.value;
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
    prepareBatch: prepareBatch,
    classify: classify,
  };
})();
