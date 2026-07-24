import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: any) {
          cookiesToSet.forEach(({ name, value }: any) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }: any) =>
            response.cookies.set(name, value, options)
          );
        }
      }
    }
  );

  // PENTING (perbaikan kecepatan): sebelumnya pakai supabase.auth.getUser(),
  // yang melakukan ROUND-TRIP JARINGAN ke server Auth Supabase untuk
  // validasi token SETIAP KALI ada navigasi ke rute terproteksi -- middleware
  // ini jalan di server untuk SEMUA request, jadi lambatnya kerasa sama saja
  // di semua browser/perangkat (bukan sesuatu yang bisa "cuma kena HP
  // tertentu"), persis seperti yang dilaporkan.
  //
  // Middleware ini cuma butuh tahu "ada sesi login atau tidak" buat
  // redirect ke /login (murni buat UX) -- bukan lapisan keamanan
  // sebenarnya. Keamanan sesungguhnya tetap dijaga oleh RLS Postgres +
  // setiap halaman/RPC yang tetap validasi ulang penggunanya sendiri (lihat
  // mis. app/dashboard/employer/page.tsx yang tetap panggil
  // supabase.auth.getUser() sendiri). Jadi di sini cukup getSession(), yang
  // cuma decode cookie JWT secara lokal TANPA network call sama sekali --
  // menghilangkan satu round-trip penuh dari SETIAP navigasi ke
  // /dashboard, /kyc, /chat, /notifications, /admin.
  const {
    data: { session }
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  const path = request.nextUrl.pathname;
  const protectedPrefixes = ["/dashboard", "/kyc", "/chat", "/notifications"];
  const isProtected = protectedPrefixes.some((p) => path.startsWith(p));

  if (isProtected && !user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  // Admin panel login lives OUTSIDE /admin (at /admin-login) specifically to
  // avoid a redirect loop: /admin requires a session, so the login page
  // itself must never fall under the /admin prefix.
  if (path.startsWith("/admin") && !user) {
    return NextResponse.redirect(new URL("/admin-login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/kyc/:path*", "/chat/:path*", "/notifications/:path*", "/admin/:path*"]
};
