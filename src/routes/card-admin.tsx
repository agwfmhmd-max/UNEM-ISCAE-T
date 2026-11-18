import { createFileRoute } from "@tanstack/react-router";
import cardAdminHtml from "../legacy/card-admin.html?raw";

// صفحة المشرف الرئيسي لإتاحة بطاقة الانتساب لطالب (برقم تسجيله) وإرسال إشعار له. الصلاحية تُفرض في قاعدة البيانات.
export const Route = createFileRoute("/card-admin")({
  server: {
    handlers: {
      GET: () =>
        new Response(cardAdminHtml, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "x-robots-tag": "noindex, nofollow",
          },
        }),
    },
  },
});
