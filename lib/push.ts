import { createClient } from "@/lib/supabase/client";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

export async function getPushSubscriptionStatus() {
  if (!pushSupported()) return "unsupported" as const;
  if (Notification.permission === "denied") return "denied" as const;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? ("subscribed" as const) : ("unsubscribed" as const);
}

export async function subscribeToPush(profileId: string) {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY belum diset di .env");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Izin notifikasi ditolak");

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey)
    });
  }

  const json = sub.toJSON();
  const supabase = createClient();
  await supabase.from("push_subscriptions").upsert(
    {
      profile_id: profileId,
      endpoint: json.endpoint!,
      p256dh: json.keys!.p256dh,
      auth: json.keys!.auth,
      device_label: navigator.userAgent.slice(0, 120)
    },
    { onConflict: "endpoint" }
  );
  return sub;
}

export async function unsubscribeFromPush() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  const supabase = createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

// beri tahu service worker percakapan mana yang sedang aktif dibuka,
// supaya push untuk chat itu tidak dobel dengan toast in-app.
export function notifyActiveConversation(conversationId: string | null) {
  if (!pushSupported()) return;
  navigator.serviceWorker.ready.then((reg) => {
    reg.active?.postMessage({ type: "ACTIVE_CONVERSATION", conversationId });
  });
}
