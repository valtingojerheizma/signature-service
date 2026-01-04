import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { uploadAsset } from '@/lib/s3';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = session.user.tenantId;
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const templateId = formData.get('templateId') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Convert to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload to S3
    const result = await uploadAsset(
      tenantId,
      buffer,
      file.name,
      file.type
    );

    // Save to database if template ID provided
    if (templateId) {
      await prisma.templateAsset.create({
        data: {
          templateId,
          filename: file.name,
          mimeType: result.mimeType,
          s3Key: result.key,
          s3Bucket: process.env.S3_BUCKET || 'signatureops-assets',
          size: result.size,
          url: result.url,
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          tenantId,
          adminUserId: session.user.id,
          action: 'TEMPLATE_ASSET_UPLOADED',
          entityType: 'TemplateAsset',
          entityId: templateId,
          description: `Uploaded asset "${file.name}"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      url: result.url,
      key: result.key,
    });
  } catch (error: any) {
    console.error('Asset upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload asset' },
      { status: 400 }
    );
  }
}
