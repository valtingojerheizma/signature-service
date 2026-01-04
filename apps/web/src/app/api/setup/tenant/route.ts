import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const CreateTenantSchema = z.object({
  domain: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { domain } = CreateTenantSchema.parse(body);

    // Check if tenant already exists for this domain
    let tenant = await prisma.tenant.findUnique({
      where: { domain },
    });

    if (tenant) {
      // Link user to existing tenant
      await prisma.adminUser.update({
        where: { id: session.user.id },
        data: { tenantId: tenant.id },
      });
    } else {
      // Create new tenant with 14-day trial
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 14);

      tenant = await prisma.tenant.create({
        data: {
          domain,
          name: domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1),
          adminUsers: {
            connect: { id: session.user.id },
          },
          billingAccount: {
            create: {
              plan: 'TRIAL',
              status: 'ACTIVE',
              trialEndsAt,
            },
          },
        },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          tenantId: tenant.id,
          adminUserId: session.user.id,
          action: 'TENANT_CREATED',
          entityType: 'Tenant',
          entityId: tenant.id,
          description: `Created organization for ${domain}`,
        },
      });
    }

    return NextResponse.json({ success: true, tenantId: tenant.id });
  } catch (error) {
    console.error('Create tenant error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
