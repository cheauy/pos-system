import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAppUrl } from '@/lib/tenancy/domain';

/** Recovery TokenHash supports opening a team setup email on another device.
 * Configure the conditional Supabase email template in README-USERS.md.
 * No caller-supplied redirect or OTP type is accepted.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token_hash');
  const fail = () => NextResponse.redirect(getAppUrl('/team-setup?error=invalid-link'));
  if (!token || token.length > 512 || !/^[A-Za-z0-9_-]+$/.test(token)) return fail();
  try {
    const db = await createClient();
    const { error } = await db.auth.verifyOtp({ type: 'recovery', token_hash: token });
    if (error) return fail();
    const response = NextResponse.redirect(getAppUrl('/team-setup'));
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch { return fail(); }
}
