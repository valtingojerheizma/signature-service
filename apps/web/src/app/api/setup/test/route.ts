import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { testConnection } from '@/lib/google/client';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = session.user.tenantId;

    // Get workspace connection
    const connection = await prisma.workspaceConnection.findUnique({
      where: { tenantId },
    });

    if (!connection) {
      return NextResponse.json(
        { error: 'No credentials found. Please upload your service account key.' },
        { status: 400 }
      );
    }

    // Get admin email for impersonation
    const adminUser = await prisma.adminUser.findUnique({
      where: { id: session.user.id },
    });

    if (!adminUser) {
      return NextResponse.json(
        { error: 'Admin user not found' },
        { status: 400 }
      );
    }

    // Test connection
    const result = await testConnection(tenantId, adminUser.email);

    if (result.success) {
      return NextResponse.json({
        success: true,
        users: result.users?.map((u) => ({
          name: u.name.fullName,
          email: u.primaryEmail,
        })),
      });
    } else {
      return NextResponse.json(
        { error: result.error || 'Connection test failed' },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Test connection error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to test connection' },
      { status: 500 }
    );
  }
}
