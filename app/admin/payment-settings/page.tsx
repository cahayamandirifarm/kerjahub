"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Trash2 } from "lucide-react";

export default function AdminPaymentSettingsPage() {
  const supabase = createClient();
  const [form, setForm] = useState({ bank_name: "", account_number: "", account_holder: "", qris_image_url: "" });
  const [qrisFile, setQrisFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("payment_settings")
      .select("*")
      .eq("id", 1)
      .single()
      .then(({ data }) => {
        if (data) {
          setForm({
            bank_name: data.bank_name || "",
            account_number: data.account_number || "",
            account_holder: data.account_holder || "",
            qris_image_url: data.qris_image_url || ""
          });
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    let qris_image_url = form.qris_image_url;
    if (qrisFile) {
      const path = `qris-${Date.now()}-${qrisFile.name}`;
      const { error: uploadError } = await supabase.storage.from("payment-settings").upload(path, qrisFile, {
        upsert: true
      });
      if (!uploadError) {
        const { data } = supabase.storage.from("payment-settings").getPublicUrl(path);
        qris_image_url = data.publicUrl;
      }
    }

    const { error } = await supabase
      .from("payment_settings")
      .update({
        bank_name: form.bank_name,
        account_number: form.account_number,
        account_holder: form.account_holder,
        qris_image_url,
        updated_at: new Date().toISOString()
      })
      .eq("id", 1);

    setLoading(false);
    setForm((f) => ({ ...f, qris_image_url }));
    setMessage(error ? "Gagal menyimpan." : "Pengaturan pembayaran tersimpan.");
  }

  async function handleClearBank() {
    if (!confirm("Kosongkan data rekening bank? Metode transfer bank akan tersembunyi bagi pengguna dan hanya QRIS yang tampil.")) {
      return;
    }
    setLoading(true);
    setMessage(null);
    const cleared = { bank_name: "", account_number: "", account_holder: "" };
    const { error } = await supabase
      .from("payment_settings")
      .update({ ...cleared, updated_at: new Date().toISOString() })
      .eq("id", 1);
    setLoading(false);
    if (error) {
      setMessage("Gagal menghapus rekening.");
      return;
    }
    setForm((f) => ({ ...f, ...cleared }));
    setMessage("Rekening bank dikosongkan. Pengguna hanya akan melihat QRIS.");
  }

  return (
    <div className="max-w-lg">
      <h1 className="font-display text-2xl font-semibold mb-1">Pengaturan Pembayaran</h1>
      <p className="text-sm text-ink/60 mb-6">
        Data ini otomatis dipakai di popup top up saldo pengguna — perubahan langsung berlaku. Rekening bank boleh
        dikosongkan: jika kosong, metode transfer bank akan disembunyikan bagi pengguna dan hanya gambar QRIS yang
        ditampilkan.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 card p-5">
        <div className="flex items-center justify-between">
          <p className="label !mb-0">Rekening Bank (opsional)</p>
          {(form.bank_name || form.account_number || form.account_holder) && (
            <button
              type="button"
              onClick={handleClearBank}
              disabled={loading}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-clay hover:underline disabled:opacity-50"
            >
              <Trash2 size={14} />
              Hapus Rekening
            </button>
          )}
        </div>
        <div>
          <label className="label">Nama Bank</label>
          <input
            className="input"
            placeholder="Kosongkan jika tidak dipakai"
            value={form.bank_name}
            onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
          />
        </div>
        <div>
          <label className="label">Nomor Rekening</label>
          <input
            className="input"
            placeholder="Kosongkan jika tidak dipakai"
            value={form.account_number}
            onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))}
          />
        </div>
        <div>
          <label className="label">Atas Nama</label>
          <input
            className="input"
            placeholder="Kosongkan jika tidak dipakai"
            value={form.account_holder}
            onChange={(e) => setForm((f) => ({ ...f, account_holder: e.target.value }))}
          />
        </div>
        <div>
          <label className="label">Gambar QRIS</label>
          {form.qris_image_url && (
            <img src={form.qris_image_url} alt="QRIS saat ini" className="w-32 h-32 object-contain border border-line rounded-lg mb-2" />
          )}
          <input className="input" type="file" accept="image/*" onChange={(e) => setQrisFile(e.target.files?.[0] || null)} />
        </div>
        {!form.bank_name && !form.account_number && !form.account_holder && !form.qris_image_url && !qrisFile && (
          <p className="text-xs text-clay">
            Rekening bank dan QRIS masih kosong — pengguna tidak akan melihat metode pembayaran apa pun di popup top up.
          </p>
        )}
        {message && <p className="text-sm text-turquoise">{message}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Menyimpan..." : "Simpan Pengaturan"}
        </button>
      </form>
    </div>
  );
}
