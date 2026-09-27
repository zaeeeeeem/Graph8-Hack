import { NextResponse, type NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

/** Only same-site paths are allowed as a post-login destination (no open redirects). */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/office";
}

/**
 * OAuth (Google) and email-confirmation links land here with a PKCE `code`. It is exchanged for a
 * session (JWT in cookies), then the user continues to the dashboard.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");

  if (code) {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    // Confirmation link opened in a different browser than the sign-up: the email IS confirmed,
    // but this browser has no PKCE verifier to finish the session — ask for the password once.
    if (/code verifier|code_verifier|flow state/i.test(error.message)) {
      const msg = "Your email is confirmed. Sign in to continue.";
      return NextResponse.redirect(`${origin}/?auth=signin&next=${encodeURIComponent(next)}&auth_error=${encodeURIComponent(msg)}`);
    }
    return NextResponse.redirect(`${origin}/?auth=signin&next=${encodeURIComponent(next)}&auth_error=${encodeURIComponent(error.message)}`);
  }
  const message = providerError ?? "The sign-in link is missing or has expired.";
  return NextResponse.redirect(`${origin}/?auth=signin&next=${encodeURIComponent(next)}&auth_error=${encodeURIComponent(message)}`);
}
