import BroadcastForm from "./BroadcastForm";

export default function AdminBroadcastPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-1">Broadcast Notifikasi</h1>
      <p className="text-sm text-ink/60 mb-6">
        Kirim notifikasi ke semua pengguna sekaligus. Notifikasi muncul di lonceng notifikasi setiap
        penerima dan otomatis memicu push notification + badge di perangkat mereka (kalau notifikasi push
        sudah diaktifkan).
      </p>
      <BroadcastForm />
    </div>
  );
}
