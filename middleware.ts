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

  const {
    data: { user }
  } = await supabase.auth.getUser();

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
