import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createPortalSession } from '@/lib/stripe';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.tenantId) {
      return NextResponse.redirect(new URL('/auth/signin', request.url));
    }

    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';

    const portalUrl = await createPortalSession(
      session.user.tenantId,
      `${baseUrl}/dashboard/settings`
    );

    return NextResponse.redirect(portalUrl);
  } catch (error) {
    console.error('Portal error:', error);
    return NextResponse.redirect(
      new URL('/dashboard/settings?error=portal', request.url)
    );
  }
}
