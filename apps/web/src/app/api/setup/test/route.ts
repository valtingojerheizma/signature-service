import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  decrypt,
  deriveKey,
} from '@signatureops/shared/encryption';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get workspace connection
    const connection = await prisma.workspaceConnection.findUnique({
      where: { tenantId: session.user.tenantId },
    });

    if (!connection) {
      return NextResponse.json(
        { error: 'No credentials found. Please upload your service account key.' },
        { status: 400 }
      );
    }

    // Check if mock mode
    const mockMode = process.env.MOCK_GOOGLE_MODE === 'true';

    if (mockMode) {
      // Return mock users
      const mockUsers = [
        { name: 'John Doe', email: 'john.doe@example.com' },
        { name: 'Jane Smith', email: 'jane.smith@example.com' },
        { name: 'Bob Wilson', email: 'bob.wilson@example.com' },
        { name: 'Alice Johnson', email: 'alice.johnson@example.com' },
        { name: 'Charlie Brown', email: 'charlie.brown@example.com' },
      ];

      return NextResponse.json({ success: true, users: mockUsers });
    }

    // Decrypt credentials
    const masterSecret = process.env.ENCRYPTION_MASTER_SECRET;
    if (!masterSecret) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // For real implementation, we would:
    // 1. Decrypt the credentials
    // 2. Create a JWT for impersonation
    // 3. Call the Google Directory API
    // 4. Return the first 5 users

    // For now, return an error since real Google API is not implemented yet
    return NextResponse.json(
      { error: 'Real Google API integration not implemented. Enable MOCK_GOOGLE_MODE for testing.' },
      { status: 501 }
    );
  } catch (error) {
    console.error('Test connection error:', error);
    return NextResponse.json(
      { error: 'Failed to test connection. Please check your credentials.' },
      { status: 500 }
    );
  }
}
