import { createFileRoute } from "@tanstack/react-router";
import communityHtml from "../legacy/community.html?raw";

// مجتمع الطلاب — مسار مستقل مثل /emplois و /moyenne.
export const Route = createFileRoute("/community")({
  server: {
    handlers: {
      GET: () =>
        new Response(communityHtml, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        }),
    },
  },
});
