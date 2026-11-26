import { createFileRoute } from "@tanstack/react-router";
import membershipAdminHtml from "../legacy/membership-admin.html?raw";
export const Route = createFileRoute("/membership-admin")({ server: { handlers: { GET: () => new Response(membershipAdminHtml, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } }) } } });
