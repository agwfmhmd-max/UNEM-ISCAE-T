import { createFileRoute } from "@tanstack/react-router";
import verifyCardHtml from "../legacy/verify-card.html?raw";

// صفحة التحقق من بطاقة الطالب الرقمية (يفتحها رمز QR المطبوع على البطاقة) — عامة ولا تتطلب تسجيل دخول.
export const Route = createFileRoute("/verify-card")({
  server: {
    handlers: {
      GET: () =>
        new Response(verifyCardHtml, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "x-robots-tag": "noindex, nofollow",
          },
        }),
    },
  },
});
