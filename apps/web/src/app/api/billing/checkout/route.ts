import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createCheckoutSession } from '@/lib/stripe';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.tenantId) {
      return NextResponse.redirect(new URL('/auth/signin', request.url));
    }

    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';

    const checkoutUrl = await createCheckoutSession(
      session.user.tenantId,
      `${baseUrl}/dashboard/settings?success=subscribed`,
      `${baseUrl}/dashboard/settings?cancelled=true`
    );

    return NextResponse.redirect(checkoutUrl);
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.redirect(
      new URL('/dashboard/settings?error=checkout', request.url)
    );
  }
}
