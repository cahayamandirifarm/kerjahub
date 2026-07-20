import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import { NotificationProvider } from "@/lib/NotificationContext";
import { ChatUnreadProvider } from "@/lib/ChatUnreadContext";
import OnlineStatus from "@/components/OnlineStatus";
import PWAInstall from "@/components/PWAInstall";

const poppins = Poppins({
  subsets: ["latin"],
  variable: "--font-poppins",
  weight: ["400", "500", "600", "700", "800"]
});

const appleSplashScreens = [
  { size: "2048-2732", media: "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
  { size: "1668-2388", media: "(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
  { size: "1536-2048", media: "(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
  { size: "1290-2796", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  { size: "1284-2778", media: "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  { size: "1179-2556", media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  { size: "1170-2532", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  { size: "1242-2688", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  { size: "828-1792", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
  { size: "1125-2436", media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  { size: "750-1334", media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
  { size: "640-1136", media: "(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" }
];

export const metadata: Metadata = {
  title: "KerjaHub — Hubungkan Talenta, Wujudkan Kesempatan",
  description:
    "Platform terpercaya yang menghubungkan pekerja, freelancer, pemberi kerja, dan marketplace digital dalam satu ekosistem.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "KerjaHub",
    startupImage: appleSplashScreens.map((s) => ({
      url: `/splash/apple-splash-${s.size}.jpg`,
      media: s.media
    }))
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"]
  }
};

export const viewport: Viewport = {
  themeColor: "#1CB5C9"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className={`${poppins.variable} font-body antialiased`}>
        <AuthProvider>
          <NotificationProvider>
            <ChatUnreadProvider>
              <OnlineStatus />
              <PWAInstall />
              {children}
            </ChatUnreadProvider>
          </NotificationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
