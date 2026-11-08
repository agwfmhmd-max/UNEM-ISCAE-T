import { createFileRoute } from "@tanstack/react-router";
import scanCardHtml from "../legacy/scan-card.html?raw";

// صفحة المشرفين لفحص بطاقات الطلاب (مسح QR بالكاميرا أو إدخال الرقم). الصلاحية تُفرض في قاعدة البيانات.
export const Route = createFileRoute("/scan-card")({
  server: {
    handlers: {
      GET: () =>
        new Response(scanCardHtml, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "x-robots-tag": "noindex, nofollow",
            "permissions-policy": "camera=(self)",
          },
        }),
    },
  },
});
