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
  posted_by_role: "employer" | "worker";
  title: string;
  category: string;
  description: string;
  location: string;
  is_remote: boolean;
  price: number;
  is_nego?: boolean;
  estimated_duration: string;
  stage: JobStage;
  assigned_worker_id: string | null;
  view_count?: number;
  created_at: string;
  // Diisi lewat join ke profiles saat query beranda/detail -- dipakai untuk
  // menampilkan rating & jumlah pekerjaan selesai pemilik postingan.
  profiles?: PosterStats | null;
}

// Info ringkas pemilik postingan/produk, dipakai untuk badge rating &
// jumlah pesanan/pekerjaan selesai di kartu postingan/produk.
export interface PosterStats {
  id?: string;
  full_name: string;
  avatar_url?: string | null;
  rating_avg: number;
  rating_count: number;
  completed_jobs_count: number;
}

export interface EscrowPayment {
  id: string;
  job_id: string;
  employer_id: string;
  worker_id: string;
  base_amount: number;
  unique_code: number;
  total_amount: number;
  wallet_deducted: number;
  bank_account_id: string | null;
  status: "menunggu_pembayaran" | "menunggu_konfirmasi_admin" | "berhasil" | "ditolak" | "dibatalkan";
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
  stock: number;
  view_count?: number;
  created_at: string;
  // Diisi lewat join ke profiles saat query marketplace/detail -- dipakai
  // untuk menampilkan rating & jumlah pesanan selesai penjual.
  profiles?: PosterStats | null;
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

// ---------------------------------------------------------
// CHAT
// ---------------------------------------------------------
export type MessageType = "text" | "image" | "document" | "system" | "nego_offer";
export type ReadStatus = "terkirim" | "diterima" | "dibaca";
export type DisputeStatus = "menunggu_admin" | "diproses" | "selesai" | "ditolak";
export type NegoOfferStatus = "menunggu" | "diterima" | "ditolak" | "dibatalkan";

export const NEGO_QUICK_AMOUNTS = [5000, 10000, 15000, 20000, 25000];

export interface NegoOffer {
  id: string;
  conversation_id: string;
  job_id: string;
  offered_by: string;
  amount: number;
  status: NegoOfferStatus;
  message_id: string | null;
  created_at: string;
  responded_at: string | null;
}

export const DISPUTE_STATUS_LABEL: Record<DisputeStatus, string> = {
  menunggu_admin: "Menunggu Admin",
  diproses: "Diproses",
  selesai: "Selesai",
  ditolak: "Ditolak"
};

export interface ChatAttachment {
  id: string;
  message_id: string;
  conversation_id: string;
  uploaded_by: string;
  file_url: string;
  file_name: string;
  file_type: "image" | "pdf" | "document";
  file_size: number | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: MessageType;
  is_system: boolean;
  reply_to_id: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  attachments?: ChatAttachment[];
  nego_offer_id?: string | null;
  nego_offers?: NegoOffer | null;
}

export interface ConversationListItem {
  conversation_id: string;
  source_type: "job" | "marketplace";
  job_id: string | null;
  order_id: string | null;
  title: string;
  other_id: string | null;
  other_name: string | null;
  other_avatar: string | null;
  other_online: boolean;
  last_message: string | null;
  last_message_at: string;
  last_sender_id: string | null;
  unread_count: number;
  is_archived: boolean;
  is_dispute: boolean;
  is_locked: boolean;
}
