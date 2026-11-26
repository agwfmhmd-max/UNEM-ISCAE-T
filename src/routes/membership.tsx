import { createFileRoute } from "@tanstack/react-router";
import membershipHtml from "../legacy/membership.html?raw";
export const Route = createFileRoute("/membership")({ server: { handlers: { GET: () => new Response(membershipHtml, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } }) } } });
