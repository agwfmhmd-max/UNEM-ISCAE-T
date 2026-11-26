(function () {
  const W = 1011;
  const H = 638;
  const colors = {
    green: "#0b3d26",
    green2: "#15803d",
    gold: "#f5c400",
    ink: "#0f172a",
    muted: "#64748b",
  };
  const labels = {
    ar: {
      title: "بطاقة انتساب",
      org: "الاتحاد الوطني لطلبة موريتانيا",
      sub: "UNEM",
      inst: "المعهد العالي للمحاسبة وإدارة المؤسسات (ISCAE)",
      pill: "منتسب",
      name: "الاسم الكامل",
      reg: "رقم التسجيل",
      year: "السنة الدراسية",
      spec: "التخصص",
      level: "المستوى",
      phone: "رقم الهاتف",
      band: "بطاقة الانتساب الرقمية",
      bandYear: "السنة الدراسية",
      specs: {
        BA: "البنوك والتأمينات",
        FC: "المالية والمحاسبة",
        TCM: "التقنيات التجارية والتسويق",
        GRH: "تسيير الموارد البشرية",
        SAE: "الإحصاء التطبيقي للاقتصاد",
        IG: "معلوماتية التسيير",
        DI: "تطوير المعلوماتية",
        RIT: "الشبكات المعلوماتية والاتصالات",
        MASTER_FC: "ماستر المالية والمحاسبة",
        MASTER_IG: "ماستر معلوماتية التسيير",
      },
      levels: {
        L1: "السنة الأولى",
        L2: "السنة الثانية",
        L3: "السنة الثالثة",
        M1: "ماستر 1",
        M2: "ماستر 2",
      },
    },
    fr: {
      title: "CARTE D’ADHÉSION",
      org: "UNION NATIONALE DES ÉTUDIANTS DE MAURITANIE",
      sub: "UNEM",
      inst: "Institut Supérieur de Comptabilité et d’Administration d’Entreprises (ISCAE)",
      pill: "Adhérent",
      name: "Nom complet",
      reg: "N° d’inscription",
      year: "Année universitaire",
      spec: "Filière",
      level: "Niveau",
      phone: "Téléphone",
      band: "Carte d’adhésion numérique",
      bandYear: "Année universitaire",
      specs: {
        BA: "Banques et Assurances",
        FC: "Finance et Comptabilité",
        TCM: "Techniques Commerciales et Marketing",
        GRH: "Gestion des Ressources Humaines",
        SAE: "Statistique Appliquée à l'Économie",
        IG: "Informatique de Gestion",
        DI: "Développement Informatique",
        RIT: "Réseaux Informatiques et Télécoms",
        MASTER_FC: "Master Finance et Comptabilité",
        MASTER_IG: "Master Informatique de Gestion",
      },
      levels: { L1: "1re année", L2: "2e année", L3: "3e année", M1: "Master 1", M2: "Master 2" },
    },
  };
  const isArabic = (text) => /[\u0600-\u06FF]/.test(String(text || ""));
  const rounded = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  const text = (ctx, value, x, y, maxWidth, size, minSize, weight, color, align) => {
    let content = String(value == null ? "" : value);
    let fontSize = size;
    ctx.direction = isArabic(content) ? "rtl" : "ltr";
    ctx.textAlign = align || "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = color || colors.ink;
    do {
      ctx.font = `${weight} ${fontSize}px Tajawal, Cairo, "Segoe UI", Arial, sans-serif`;
      if (ctx.measureText(content).width <= maxWidth || fontSize <= minSize) break;
      fontSize -= 1;
    } while (fontSize > minSize);
    if (ctx.measureText(content).width > maxWidth) {
      while (content.length > 3 && ctx.measureText(content + "…").width > maxWidth)
        content = content.slice(0, -1);
      content += "…";
    }
    ctx.fillText(content, x, y);
    ctx.direction = "ltr";
  };
  const loadImage = (src) =>
    new Promise((resolve) => {
      if (!src) return resolve(null);
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
    });

  async function render(canvas, data, language) {
    const lang = language === "fr" ? "fr" : "ar";
    const T = labels[lang];
    try {
      await Promise.all([
        document.fonts.load("800 36px Tajawal"),
        document.fonts.load("500 20px Tajawal"),
        document.fonts.load("700 20px Tajawal"),
      ]);
    } catch (_) {}
    const [logo, photo] = await Promise.all([loadImage("/logo.png"), loadImage(data.photo)]);
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    const year = Number(data.academic_year);
    const yearText = `${year}-${year + 1}`;
    const specName = T.specs[data.spec] || "";
    const specText = `${data.spec || "—"}${specName ? ` — ${specName}` : ""}`;
    const levelText = data.promo
      ? `${lang === "fr" ? "Sortant — Promotion " : "خريج — الدفعة "}${data.promo}`
      : `${data.level || "—"}${T.levels[data.level] ? ` — ${T.levels[data.level]}` : ""}`;
    const code = data.card_code || "UNEM-ISCAE";
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    rounded(ctx, 0, 0, W, H, 34);
    ctx.clip();
    ctx.fillStyle = "#fffdf4";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = colors.gold;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(320, 0);
    ctx.lineTo(0, 160);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fde68a";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(200, 0);
    ctx.lineTo(0, 100);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = colors.green2;
    ctx.beginPath();
    ctx.moveTo(690, 0);
    ctx.lineTo(W, 0);
    ctx.lineTo(W, 64);
    ctx.lineTo(900, 22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = colors.green;
    ctx.beginPath();
    ctx.moveTo(820, 0);
    ctx.lineTo(W, 0);
    ctx.lineTo(W, 26);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(130, 128, 96, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = colors.green2;
    ctx.stroke();
    ctx.save();
    ctx.clip();
    if (logo) ctx.drawImage(logo, 34, 32, 192, 192);
    ctx.restore();
    text(ctx, T.org, 985, 76, 690, lang === "fr" ? 27 : 40, 20, "800", "#0f5132");
    ctx.fillStyle = "#1f2937";
    ctx.font = "800 21px Arial";
    ctx.textAlign = "right";
    ctx.direction = "ltr";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "6px";
    ctx.fillText(T.sub, 985, 106);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    ctx.fillStyle = colors.gold;
    ctx.beginPath();
    ctx.moveTo(300, 122);
    ctx.lineTo(985, 122);
    ctx.lineTo(960, 174);
    ctx.lineTo(275, 174);
    ctx.closePath();
    ctx.fill();
    text(ctx, T.title, 945, 162, 630, lang === "fr" ? 33 : 38, 22, "800", "#3b2a00");
    text(ctx, T.inst, 985, 200, 690, lang === "fr" ? 16.5 : 20, 11, "700", "#334155");
    ctx.save();
    rounded(ctx, 42, 236, 176, 190, 22);
    ctx.clip();
    if (photo) {
      const scale = Math.max(176 / photo.width, 190 / photo.height);
      const width = photo.width * scale;
      const height = photo.height * scale;
      ctx.drawImage(photo, 42 + (176 - width) / 2, 236 + (190 - height) / 2, width, height);
    } else {
      ctx.fillStyle = "#e7efe3";
      ctx.fillRect(42, 236, 176, 190);
      ctx.fillStyle = colors.green2;
      ctx.font = "800 104px Tajawal, Arial";
      ctx.textAlign = "center";
      ctx.direction = "ltr";
      ctx.fillText(((data.full_name || "?").trim()[0] || "?").toUpperCase(), 130, 360);
    }
    ctx.restore();
    ctx.lineWidth = 5;
    ctx.strokeStyle = colors.gold;
    rounded(ctx, 42, 236, 176, 190, 22);
    ctx.stroke();
    ctx.fillStyle = colors.green;
    rounded(ctx, 34, 436, 192, 48, 16);
    ctx.fill();
    text(ctx, data.full_name, 130, 468, 172, 24, 13, "800", "#fff", "center");
    ctx.fillStyle = colors.gold;
    rounded(ctx, 60, 490, 140, 30, 15);
    ctx.fill();
    text(ctx, T.pill, 130, 512, 124, 19, 12, "800", "#3b2a00", "center");
    ctx.fillStyle = "#475569";
    ctx.font = "700 12px Arial";
    ctx.textAlign = "center";
    ctx.direction = "ltr";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
    ctx.fillText("UNEM · ISCAE", 130, 543);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    const rows = [
      ["👤", T.name, data.full_name],
      ["🆔", T.reg, data.reg_no],
      ["📅", T.year, yearText],
      ["🎓", T.spec, specText],
      ["📚", T.level, levelText],
      ...(data.phone ? [["☎️", T.phone, data.phone]] : []),
    ];
    const compactRows = rows.length > 5;
    rows.forEach((row, index) => {
      const y = (compactRows ? 222 : 226) + index * (compactRows ? 48 : 60);
      const rowHeight = compactRows ? 44 : 52;
      ctx.fillStyle = "#fff";
      rounded(ctx, 272, y, 470, rowHeight, 14);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#efe6c4";
      ctx.stroke();
      ctx.fillStyle = colors.gold;
      rounded(ctx, 698, y + (compactRows ? 5 : 6), 38, compactRows ? 34 : 40, 11);
      ctx.fill();
      ctx.font = '22px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = "center";
      ctx.direction = "ltr";
      ctx.fillStyle = "#3b2a00";
      ctx.fillText(row[0], 717, y + (compactRows ? 27 : 34));
      text(
        ctx,
        row[1],
        688,
        y + (compactRows ? 15 : 19),
        300,
        compactRows ? 12 : 14.5,
        10,
        "700",
        colors.muted,
      );
      text(
        ctx,
        row[2],
        688,
        y + (compactRows ? 36 : 43),
        408,
        compactRows ? 21 : 26,
        12,
        "800",
        colors.ink,
      );
    });
    ctx.fillStyle = "#fff";
    rounded(ctx, 764, 222, 222, 236, 20);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = colors.gold;
    ctx.stroke();
    try {
      const qr = window.qrcode(0, "M");
      qr.addData(`${location.origin}/verify-card?c=${encodeURIComponent(data.token || "")}`);
      qr.make();
      const n = qr.getModuleCount();
      const cell = Math.floor(196 / (n + 4));
      const total = cell * (n + 4);
      const ox = 764 + (222 - total) / 2;
      const oy = 222 + 14 + (196 - total) / 2;
      ctx.fillStyle = "#fff";
      ctx.fillRect(ox, oy, total, total);
      ctx.fillStyle = colors.green;
      for (let row = 0; row < n; row++)
        for (let col = 0; col < n; col++)
          if (qr.isDark(row, col))
            ctx.fillRect(ox + (col + 2) * cell, oy + (row + 2) * cell, cell, cell);
    } catch (_) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "700 18px Arial";
      ctx.textAlign = "center";
      ctx.fillText("QR", 875, 340);
    }
    ctx.fillStyle = colors.green;
    rounded(ctx, 764, 468, 222, 36, 18);
    ctx.fill();
    text(ctx, code, 875, 492, 206, 15, 9, "800", "#fff", "center");
    const gradient = ctx.createLinearGradient(0, 560, W, 560);
    gradient.addColorStop(0, colors.green);
    gradient.addColorStop(1, colors.green2);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 556, W, 82);
    ctx.fillStyle = colors.gold;
    ctx.fillRect(0, 556, W, 5);
    text(ctx, "UNEM ISCAE", 46, 598, 360, 30, 18, "800", colors.gold, "left");
    text(ctx, location.host, 46, 623, 360, 15, 10, "600", "#cbd5e1", "left");
    text(ctx, T.band, 985, 598, 560, 26, 15, "800", "#fff");
    text(ctx, yearText, 985, 624, 200, 19, 12, "700", colors.gold);
    const measuredWidth = ctx.measureText(yearText).width || 0;
    text(ctx, T.bandYear, 985 - measuredWidth - 14, 624, 300, 17, 11, "600", "#e2e8f0");
    ctx.restore();
  }
  window.UNEM_MEMBERSHIP_CARD = { render };
})();
