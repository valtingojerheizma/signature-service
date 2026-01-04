import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { syncDirectory } from '@/lib/google/sync';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.tenantId) {
      return NextResponse.redirect(new URL('/auth/signin', request.url));
    }

    const tenantId = session.user.tenantId;

    // Get admin email for API calls
    const adminUser = await prisma.adminUser.findUnique({
      where: { id: session.user.id },
    });

    if (!adminUser) {
      return NextResponse.redirect(new URL('/dashboard/people?error=auth', request.url));
    }

    // Perform sync
    const result = await syncDirectory(tenantId, adminUser.email);

    // Create audit log
    await prisma.auditLog.create({
      data: {
        tenantId,
        adminUserId: session.user.id,
        action: 'DIRECTORY_SYNCED',
        entityType: 'Employee',
        description: `Synced ${result.total} users (${result.created} new, ${result.updated} updated)`,
        metadata: {
          created: result.created,
          updated: result.updated,
          suspended: result.suspended,
          total: result.total,
          errors: result.errors,
        },
      },
    });

    if (result.success) {
      return NextResponse.redirect(new URL('/dashboard/people?success=synced', request.url));
    } else {
      return NextResponse.redirect(new URL('/dashboard/people?warning=partial', request.url));
    }
  } catch (error) {
    console.error('Refresh people error:', error);
    return NextResponse.redirect(new URL('/dashboard/people?error=sync_failed', request.url));
  }
}
