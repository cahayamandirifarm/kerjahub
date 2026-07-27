import Script from "next/script";

// Banyak pengunjung membuka link KerjaHub dari dalam webview bawaan
// Facebook/Instagram/Threads/TikTok (bukan browser Chrome sungguhan).
// Di webview begini `beforeinstallprompt` TIDAK PERNAH muncul, jadi PWA
// tidak bisa dipasang sama sekali walau manifest & service worker sudah
// benar. Solusinya: begitu terdeteksi UA in-app browser DI ANDROID, kita
// paksa pindah ke Chrome asli lewat Android Intent URL, supaya
// `PWAInstall` bisa jalan normal di sana.
//
// Script ini HARUS `beforeInteractive` (disuntikkan Next.js ke <head>
// sebelum HTML lain di-render/hydrate) supaya redirect terjadi secepat
// mungkin, sebelum sempat "flash" render halaman di dalam webview.
const IN_APP_BROWSER_REDIRECT_SCRIPT = `
(function () {
  try {
    var ua = navigator.userAgent || "";

    // Hanya Android -- di iOS tidak ada mekanisme Intent URL seperti ini,
    // dan Safari di iOS memang tidak butuh "dipaksa" karena Add to Home
    // Screen tetap bisa dilakukan manual dari dalam beberapa in-app browser.
    var isAndroid = /Android/i.test(ua);
    if (!isAndroid) return;

    // Kalau sudah berjalan sebagai PWA yang ter-install (standalone),
    // jangan pernah redirect -- ini bukan lagi "dibuka dari sosmed".
    var isStandalone =
      window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
    if (isStandalone) return;

    // Tanda tangan UA webview Facebook/Instagram/Threads/TikTok/Messenger/Line.
    // PENTING: app Threads TIDAK menulis "Threads" di UA-nya sama sekali --
    // dia pakai nama kode internal Meta "Barcelona" (mis. "Barcelona 289.0...
    // Android"), jadi kata "Threads" di sini tidak akan pernah cocok dan
    // harus dideteksi lewat "Barcelona" ini.
    var inAppPattern = /FBAN|FBAV|FB_IAB|FBSV|Instagram|Barcelona|TikTok|BytedanceWebview|musical_ly|Line\\//i;
    if (!inAppPattern.test(ua)) return;

    // Cegah redirect loop: kalau Chrome yang dibuka lewat Intent tadi
    // gagal (mis. Chrome tidak terpasang) lalu balik lagi ke webview yang
    // sama, jangan coba redirect lagi terus-terusan.
    if (sessionStorage.getItem("kerjahub_force_chrome") === "1") return;
    sessionStorage.setItem("kerjahub_force_chrome", "1");

    var target = window.location.href;
    var withoutScheme = target.replace(/^https?:\\/\\//i, "");

    // Android Intent URL: buka URL ini secara eksplisit lewat paket Chrome
    // (com.android.chrome). Kalau Chrome tidak ada, browser_fallback_url
    // dipakai supaya tetap balik ke halaman yang sama (bukan macet blank).
    var intentUrl =
      "intent://" +
      withoutScheme +
      "#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=" +
      encodeURIComponent(target) +
      ";end;";

    window.location.replace(intentUrl);
  } catch (e) {
    // Kalau ada apapun yang gagal (browser lama, API tidak ada, dst),
    // biarkan saja halaman lanjut normal -- jangan sampai user terjebak.
  }
})();
`;

export default function InAppBrowserRedirect() {
  return (
    <Script
      id="in-app-browser-redirect"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{ __html: IN_APP_BROWSER_REDIRECT_SCRIPT }}
    />
  );
}
