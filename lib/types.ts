export type Role = "worker" | "employer" | "admin";

export type JobStage =
  | "terbuka"
  | "diterima"
  | "menunggu_pembayaran"
  | "menunggu_konfirmasi_admin"
  | "dana_diamankan"
  | "dikerjakan"
  | "menunggu_konfirmasi_selesai"
  | "revisi"
  | "selesai"
  | "dibatalkan";

export const STAGE_LABEL: Record<JobStage, string> = {
  terbuka: "Terbuka",
  diterima: "Pelamar Diterima",
  menunggu_pembayaran: "Menunggu Pembayaran",
  menunggu_konfirmasi_admin: "Menunggu Konfirmasi Admin",
  dana_diamankan: "Dana Diamankan",
  dikerjakan: "Sedang Dikerjakan",
  menunggu_konfirmasi_selesai: "Menunggu Konfirmasi",
  revisi: "Revisi",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan"
};

export interface Profile {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  role: Role;
  phone: string | null;
  bio: string | null;
  skills: string[] | null;
  kyc_status: "belum" | "menunggu" | "terverifikasi" | "ditolak";
  wallet_balance: number;
  notif_sound_enabled: boolean;
  is_online: boolean;
  rating_avg: number;
  rating_count: number;
  completed_jobs_count: number;
  district: string | null;
  city: string | null;
  created_at: string;
}

export interface Job {
  id: string;
  employer_id: string;
  title: string;
  category: string;
  description: string;
  location: string;
  is_remote: boolean;
  price: number;
  estimated_duration: string;
  stage: JobStage;
  assigned_worker_id: string | null;
  created_at: string;
}

export interface EscrowPayment {
  id: string;
  job_id: string;
  employer_id: string;
  worker_id: string;
  base_amount: number;
  unique_code: number;
  total_amount: number;
  bank_account_id: string | null;
  status: "menunggu_pembayaran" | "menunggu_konfirmasi_admin" | "berhasil" | "ditolak";
  proof_url: string | null;
  created_at: string;
}

export interface BankAccount {
  id: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
  is_active: boolean;
}

export const JOB_CATEGORIES = [
  "Tukang Kebun",
  "Bersih-bersih Rumah",
  "Antar Jemput / Kurir",
  "Perbaikan Rumah",
  "Desain & Konten Digital",
  "Admin & Data Entry",
  "Fotografi & Video",
  "Lainnya"
];

export const DIGITAL_CATEGORIES: { value: string; label: string }[] = [
  { value: "akun_game", label: "Akun Game" },
  { value: "akun_tiktok", label: "Akun TikTok" },
  { value: "akun_facebook", label: "Akun Facebook" },
  { value: "akun_instagram", label: "Akun Instagram" },
  { value: "akun_youtube", label: "Akun YouTube" },
  { value: "lainnya", label: "Lainnya" }
];

export interface DigitalListing {
  id: string;
  seller_id: string;
  category: string;
  title: string;
  description: string;
  price: number;
  cover_image: string;
  gallery_images: string[];
  status: "aktif" | "nonaktif" | "terjual" | "dihapus";
  created_at: string;
}

export type DigitalOrderStatus =
  | "menunggu_pembayaran"
  | "menunggu_konfirmasi_admin"
  | "dana_diamankan"
  | "menunggu_konfirmasi_selesai"
  | "sengketa"
  | "selesai"
  | "dibatalkan";

export const DIGITAL_ORDER_LABEL: Record<DigitalOrderStatus, string> = {
  menunggu_pembayaran: "Menunggu Pembayaran",
  menunggu_konfirmasi_admin: "Menunggu Konfirmasi Admin",
  dana_diamankan: "Dana Diamankan",
  menunggu_konfirmasi_selesai: "Menunggu Konfirmasi",
  sengketa: "Sengketa",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan"
};

export const ADMIN_WHATSAPP_NUMBER = "6285178509892";
