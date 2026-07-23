// supabase/functions/send-chat-push/index.ts
//
// Dipanggil oleh 2 trigger Postgres (lewat pg_net):
//   1. `trg_notify_push_for_message` (0009) — setiap pesan chat baru.
//      body: { message_id, conversation_id, sender_id }
//   2. `trg_notify_push_for_notification` (0044) — setiap baris baru di
//      tabel `notifications` SELAIN category='chat' (lamaran kerja,
//      pembayaran, escrow, dll — semua event yang sudah otomatis
//      menulis ke tabel `notifications` di seluruh app).
//      body: { kind: "generic", notification_id, profile_id, title, body, link }
//
// Keduanya berujung ke fungsi kirim push yang sama (sendPushToProfile),
// supaya logika kirim/hapus-subscription-kedaluwarsa tidak dobel ditulis.
//
// Deploy: supabase functions deploy send-chat-push
// Secrets yang WAJIB diset (supabase secrets set ...):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY,
//   VAPID_PRIVATE_KEY, VAPID_SUBJECT (mis. "mailto:admin@kerjahub.app"),
//   PUSH_WEBHOOK_SECRET (harus SAMA PERSIS dengan push_config.webhook_secret)

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";
const WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function snippetFor(messageType: string, content: string) {
  if (messageType === "image") return "📷 Mengirim gambar";
  if (messageType === "document") return `📄 ${content || "Mengirim dokumen"}`;
  return content?.slice(0, 120) || "Pesan baru";
}

// Hitung total notifikasi belum dibaca PER penerima, supaya angka badge
// merah di ikon app (mirip WhatsApp) selalu akurat.
async function badgeCountByProfile(profileIds: string[]) {
  const { data } = await supabase.from("notifications").select("profile_id").in("profile_id", profileIds).eq("is_read", false);
  const map = new Map<string, number>();
  for (const row of data ?? []) map.set(row.profile_id, (map.get(row.profile_id) ?? 0) + 1);
  return map;
}

// Kirim 1 payload push ke semua subscription milik daftar profile_id,
// lalu bersihkan subscription yang sudah kedaluwarsa (404/410).
async function sendPushToProfiles(profileIds: string[], buildPayload: (badgeCount: number) => object) {
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, profile_id, endpoint, p256dh, auth")
    .in("profile_id", profileIds);

  if (!subs?.length) return "no subscriptions";

  const badgeMap = await badgeCountByProfile(profileIds);
  const expiredIds: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      const payload = JSON.stringify(buildPayload(badgeMap.get(s.profile_id) ?? 1));
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        console.log(`push OK -> profile ${s.profile_id}`);
      } catch (err: any) {
        console.error(`push GAGAL -> profile ${s.profile_id}:`, err?.statusCode, err?.body || err?.message || err);
        if (err?.statusCode === 404 || err?.statusCode === 410) expiredIds.push(s.id);
      }
    })
  );

  if (expiredIds.length) await supabase.from("push_subscriptions").delete().in("id", expiredIds);
  return "ok";
}

// -------- Jalur 1: pesan chat baru --------
async function handleChatMessage(body: any) {
  const { message_id, conversation_id, sender_id } = body;
  if (!message_id || !conversation_id || !sender_id) return new Response("Bad request", { status: 400 });

  const { data: message } = await supabase
    .from("messages")
    .select("content, message_type, is_system")
    .eq("id", message_id)
    .single();
  if (!message || message.is_system) return new Response("skip", { status: 200 });

  const { data: sender } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", sender_id).single();

  const { data: members } = await supabase
    .from("conversation_members")
    .select("profile_id")
    .eq("conversation_id", conversation_id)
    .neq("profile_id", sender_id);
  if (!members?.length) return new Response("no recipients", { status: 200 });

  const result = await sendPushToProfiles(
    members.map((m) => m.profile_id),
    (badgeCount) => ({
      title: sender?.full_name || "Pesan baru",
      body: snippetFor(message.message_type, message.content),
      icon: sender?.avatar_url || "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      url: `/chat/${conversation_id}`,
      conversationId: conversation_id,
      tag: `chat-${conversation_id}`,
      urgent: false,
      badgeCount
    })
  );
  return new Response(result, { status: 200 });
}

// -------- Jalur 2: notifikasi umum (lamaran, pembayaran, escrow, dll) --------
async function handleGenericNotification(body: any) {
  const { profile_id, title, body: notifBody, link } = body;
  if (!profile_id || !title) return new Response("Bad request", { status: 400 });

  const result = await sendPushToProfiles([profile_id], (badgeCount) => ({
    title,
    body: notifBody || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    url: link || "/notifications",
    tag: `notif-${profile_id}-${Date.now()}`,
    badgeCount
  }));
  return new Response(result, { status: 200 });
}

Deno.serve(async (req) => {
  try {
    if (req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    if (body.kind === "generic") return await handleGenericNotification(body);
    return await handleChatMessage(body);
  } catch (err) {
    console.error(err);
    return new Response("error", { status: 500 });
  }
});
