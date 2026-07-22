// supabase/functions/send-chat-push/index.ts
//
// Dipanggil oleh trigger Postgres `trg_notify_push_for_message` (lewat pg_net)
// setiap ada pesan baru di tabel `messages`. Fungsi ini:
//   1. Memverifikasi header rahasia (x-webhook-secret) supaya tidak sembarang
//      orang bisa memicu push lewat endpoint publik ini.
//   2. Mengambil detail pesan, pengirim, dan anggota percakapan lain.
//   3. Mengirim Web Push (avatar, nama, cuplikan pesan) ke setiap subscription
//      milik anggota lain. Supaya tidak dobel dengan toast in-app saat
//      percakapan itu sedang aktif dibuka, pengecekan "apakah user sedang
//      lihat chat ini" dilakukan di SISI CLIENT (service worker), lihat
//      public/service-worker.js — bukan di sini, karena server tidak tahu
//      status fokus tab pengguna secara real-time.
//   4. Membersihkan subscription yang sudah kedaluwarsa (404/410).
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

Deno.serve(async (req) => {
  try {
    if (req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { message_id, conversation_id, sender_id } = await req.json();
    if (!message_id || !conversation_id || !sender_id) {
      return new Response("Bad request", { status: 400 });
    }

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

    const recipientIds = members.map((m) => m.profile_id);
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("id, profile_id, endpoint, p256dh, auth")
      .in("profile_id", recipientIds);

    if (!subs?.length) return new Response("no subscriptions", { status: 200 });

    // Hitung total notifikasi belum dibaca PER penerima, supaya angka badge
    // merah di ikon app (mirip WhatsApp) selalu akurat — bukan cuma "+1"
    // per pesan, tapi total sesungguhnya (termasuk lamaran/pembayaran/dll
    // yang belum dibaca juga, karena semua masuk ke tabel `notifications`).
    const { data: unreadCounts } = await supabase
      .from("notifications")
      .select("profile_id")
      .in("profile_id", recipientIds)
      .eq("is_read", false);

    const badgeCountByProfile = new Map<string, number>();
    for (const row of unreadCounts ?? []) {
      badgeCountByProfile.set(row.profile_id, (badgeCountByProfile.get(row.profile_id) ?? 0) + 1);
    }

    const expiredIds: string[] = [];

    await Promise.all(
      subs.map(async (s) => {
        const payload = JSON.stringify({
          title: sender?.full_name || "Pesan baru",
          body: snippetFor(message.message_type, message.content),
          icon: sender?.avatar_url || "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          conversationId: conversation_id,
          tag: `chat-${conversation_id}`,
          badgeCount: badgeCountByProfile.get(s.profile_id) ?? 1
        });

        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload
          );
        } catch (err: any) {
          if (err?.statusCode === 404 || err?.statusCode === 410) expiredIds.push(s.id);
        }
      })
    );

    if (expiredIds.length) {
      await supabase.from("push_subscriptions").delete().in("id", expiredIds);
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response("error", { status: 500 });
  }
});
