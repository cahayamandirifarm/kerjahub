import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import { NotificationProvider } from "@/lib/NotificationContext";
import OnlineStatus from "@/components/OnlineStatus";
import PWAInstall from "@/components/PWAInstall";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["500", "600", "700"]
});
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700", "800"]
});

export const metadata: Metadata = {
  title: "KerjaHub — Penghubung Pemberi Kerja & Pencari Kerja",
  description:
    "Marketplace kerja untuk semua jenis pekerjaan, online maupun offline: tukang kebun, bersih-bersih, antar jemput, dan lainnya.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "KerjaHub"
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }]
  }
};

export const viewport: Viewport = {
  themeColor: "#2F6F4E"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className={`${fraunces.variable} ${jakarta.variable} font-body antialiased`}>
        <AuthProvider>
          <NotificationProvider>
            <OnlineStatus />
            <PWAInstall />
            {children}
          </NotificationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
