import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { GoogleServiceAccountSchema } from '@signatureops/shared';
import {
  encryptServiceAccountCredentials,
  validateMasterSecret,
} from '@signatureops/shared/encryption';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const credentials = GoogleServiceAccountSchema.parse(body.credentials);

    // Validate encryption secret
    const masterSecret = process.env.ENCRYPTION_MASTER_SECRET;
    const keyId = process.env.ENCRYPTION_KEY_ID || 'key_001';

    if (!masterSecret || !validateMasterSecret(masterSecret)) {
      console.error('Invalid or missing ENCRYPTION_MASTER_SECRET');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Encrypt credentials
    const encrypted = encryptServiceAccountCredentials(
      JSON.stringify(credentials),
      masterSecret,
      keyId
    );

    // Check if connection already exists
    const existing = await prisma.workspaceConnection.findUnique({
      where: { tenantId: session.user.tenantId },
    });

    if (existing) {
      // Update existing connection
      await prisma.workspaceConnection.update({
        where: { tenantId: session.user.tenantId },
        data: {
          serviceAccountEmail: credentials.client_email,
          encryptedCredentials: encrypted.ciphertext,
          encryptionKeyId: encrypted.keyId,
          encryptionIv: encrypted.iv,
          encryptionAuthTag: encrypted.authTag,
        },
      });
    } else {
      // Create new connection
      await prisma.workspaceConnection.create({
        data: {
          tenantId: session.user.tenantId,
          serviceAccountEmail: credentials.client_email,
          encryptedCredentials: encrypted.ciphertext,
          encryptionKeyId: encrypted.keyId,
          encryptionIv: encrypted.iv,
          encryptionAuthTag: encrypted.authTag,
        },
      });
    }

    // Create audit log
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        adminUserId: session.user.id,
        action: existing ? 'WORKSPACE_UPDATED' : 'WORKSPACE_CONNECTED',
        entityType: 'WorkspaceConnection',
        description: `${existing ? 'Updated' : 'Connected'} Google Workspace with service account ${credentials.client_email}`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Save credentials error:', error);
    return NextResponse.json({ error: 'Invalid credentials format' }, { status: 400 });
  }
}
