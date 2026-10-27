import type { VapidKeys } from "@block65/webcrypto-web-push";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./unem-config";
import {
  sendPushNotification,
  type PushNotificationPayload,
  type StoredPushSubscription,
} from "./unem-push";

/**
 * إرسال إشعارات جماعي سريع لأكثر من 1000 طالب على Cloudflare Workers.
 *
 * القيد: الطلب الواحد محدود بعدد الاتصالات الخارجية وبزمن المعالج، فإرسال ألف إشعار من طلب واحد
 * بطيء أو يفشل. الحل: توزيع هرمي — كل طلب يرسل حتى LEAF_MAX إشعاراً مباشرة، وإن زاد العدد قسّمه إلى
 * حتى BRANCH_MAX طلباً فرعياً موقّعاً (HMAC) يعمل كل منها بالتوازي على نسخة مستقلة من الخادم.
 * إن تعذّر الطلب الفرعي لأي سبب يرسل الطلب الأصلي المجموعة بنفسه (لا يضيع إشعار).
 */
export const LEAF_MAX = 20;
export const BRANCH_MAX = 40;
export const RELAY_PATH = "/api/public/push/relay";
export const RELAY_MAX_AGE_MS = 120_000;
const MAX_DEPTH = 4;

export type FanoutResult = { sent: number; gone: number };

const enc = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(`unem-push-relay:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signRelayBody(body: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
}

export async function verifyRelayBody(body: string, sig: string, secret: string): Promise<boolean> {
  const expected = await signRelayBody(body, secret);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/** حذف الاشتراكات المنتهية (404/410) دفعة واحدة */
async function pruneGone(endpoints: string[]): Promise<void> {
  for (let i = 0; i < endpoints.length; i += 200) {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/community_prune_push`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ p_endpoints: endpoints.slice(i, i + 200) }),
    }).catch(() => null);
  }
}

/** إرسال مباشر لمجموعة صغيرة بالتوازي */
async function sendDirect(
  subs: StoredPushSubscription[],
  payload: PushNotificationPayload,
  vapid: VapidKeys,
): Promise<FanoutResult> {
  const outcomes = await Promise.all(subs.map((sub) => sendPushNotification(sub, payload, vapid)));
  let sent = 0;
  const gone: string[] = [];
  outcomes.forEach((outcome, i) => {
    if (outcome === "ok") sent += 1;
    else if (outcome === "gone") {
      const sub = subs[i];
      if (sub) gone.push(sub.endpoint);
    }
  });
  if (gone.length > 0) await pruneGone(gone);
  return { sent, gone: gone.length };
}

/** احتياطي: إرسال مجموعة كبيرة من نفس الطلب على دفعات متتالية */
async function sendInBatches(
  subs: StoredPushSubscription[],
  payload: PushNotificationPayload,
  vapid: VapidKeys,
): Promise<FanoutResult> {
  const total: FanoutResult = { sent: 0, gone: 0 };
  for (let i = 0; i < subs.length; i += LEAF_MAX) {
    const r = await sendDirect(subs.slice(i, i + LEAF_MAX), payload, vapid);
    total.sent += r.sent;
    total.gone += r.gone;
  }
  return total;
}

async function relay(
  origin: string,
  subs: StoredPushSubscription[],
  payload: PushNotificationPayload,
  vapid: VapidKeys,
  depth: number,
): Promise<FanoutResult> {
  const body = JSON.stringify({ subs, payload, ts: Date.now(), depth });
  const sig = await signRelayBody(body, String(vapid.privateKey ?? ""));
  const res = await fetch(`${origin}${RELAY_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-relay-sig": sig },
    body,
  });
  if (!res.ok) throw new Error(`relay ${res.status}`);
  const data = (await res.json()) as Partial<FanoutResult>;
  return { sent: Number(data.sent) || 0, gone: Number(data.gone) || 0 };
}

export async function dispatchPush(
  origin: string,
  subs: StoredPushSubscription[],
  payload: PushNotificationPayload,
  vapid: VapidKeys,
  depth = 0,
): Promise<FanoutResult> {
  if (subs.length === 0) return { sent: 0, gone: 0 };
  if (subs.length <= LEAF_MAX) return sendDirect(subs, payload, vapid);
  if (depth >= MAX_DEPTH) return sendInBatches(subs, payload, vapid);

  const groups = Math.min(BRANCH_MAX, Math.ceil(subs.length / LEAF_MAX));
  const size = Math.ceil(subs.length / groups);
  const parts: StoredPushSubscription[][] = [];
  for (let i = 0; i < subs.length; i += size) parts.push(subs.slice(i, i + size));

  const results = await Promise.all(
    parts.map((part) =>
      relay(origin, part, payload, vapid, depth + 1).catch(() => sendInBatches(part, payload, vapid)),
    ),
  );
  return results.reduce(
    (acc, r) => ({ sent: acc.sent + r.sent, gone: acc.gone + r.gone }),
    { sent: 0, gone: 0 },
  );
}
