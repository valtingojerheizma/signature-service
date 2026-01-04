import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import {
  sanitizeSignatureHtml,
  validateSignatureHtml,
  generatePlainText,
} from '@signatureops/shared/template';

const SaveTemplateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(255),
  htmlContent: z.string().min(1),
  description: z.string().max(1000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = session.user.tenantId;
    const body = await request.json();
    const { id, name, htmlContent, description } = SaveTemplateSchema.parse(body);

    // Validate HTML
    const validationErrors = validateSignatureHtml(htmlContent);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: validationErrors.join('. ') },
        { status: 400 }
      );
    }

    // Sanitize HTML
    const sanitizedHtml = sanitizeSignatureHtml(htmlContent);

    // Generate plain text version
    const plainText = generatePlainText(sanitizedHtml);

    if (id) {
      // Update existing template
      const existing = await prisma.template.findUnique({
        where: { id },
      });

      if (!existing || existing.tenantId !== tenantId) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }

      const template = await prisma.template.update({
        where: { id },
        data: {
          name,
          description,
          htmlContent: sanitizedHtml,
          plainText,
          version: { increment: 1 },
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          tenantId,
          adminUserId: session.user.id,
          action: 'TEMPLATE_UPDATED',
          entityType: 'Template',
          entityId: template.id,
          description: `Updated signature "${name}"`,
        },
      });

      return NextResponse.json({ success: true, templateId: template.id });
    } else {
      // Create new template
      const template = await prisma.template.create({
        data: {
          tenantId,
          name,
          description,
          htmlContent: sanitizedHtml,
          plainText,
          isDefault: true, // First template is default
          isActive: true,
        },
      });

      // Create default assignment rule if this is the first template
      const existingRule = await prisma.assignmentRule.findFirst({
        where: { tenantId, type: 'TENANT_DEFAULT' },
      });

      if (!existingRule) {
        await prisma.assignmentRule.create({
          data: {
            tenantId,
            templateId: template.id,
            type: 'TENANT_DEFAULT',
            priority: 0,
            isActive: true,
          },
        });
      }

      // Audit log
      await prisma.auditLog.create({
        data: {
          tenantId,
          adminUserId: session.user.id,
          action: 'TEMPLATE_CREATED',
          entityType: 'Template',
          entityId: template.id,
          description: `Created signature "${name}"`,
        },
      });

      return NextResponse.json({ success: true, templateId: template.id });
    }
  } catch (error) {
    console.error('Save template error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid template data' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to save template' },
      { status: 500 }
    );
  }
}
