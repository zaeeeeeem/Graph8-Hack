import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL, hasSupabaseEnv } from "@/lib/supabase/env";

/**
 * Refreshes the Supabase session cookie on every page request and guards the dashboard:
 * `/office/*` without a verified session → back to the landing page with the sign-in modal open,
 * remembering where the user was going (`?auth=signin&next=/office/...`).
 */
export async function proxy(request: NextRequest) {
  // Email-confirmation / OAuth links that fall back to the Site URL arrive as `/?code=…`:
  // hand them to the callback route so the code is exchanged for a session.
  if (request.nextUrl.pathname === "/" && request.nextUrl.searchParams.has("code")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    if (!url.searchParams.has("next")) url.searchParams.set("next", "/office");
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });
  if (!hasSupabaseEnv) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims() verifies the JWT (signature + expiry) and refreshes it when needed.
  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims?.sub;

  if (!signedIn && request.nextUrl.pathname.startsWith("/office")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    url.searchParams.set("auth", "signin");
    url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}

export const config = {
  // Pages only: skip Next internals, the image optimiser and static files in /public.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)"],
};
