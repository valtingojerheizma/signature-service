import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getDefaultTemplate } from '@signatureops/shared';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = session.user.tenantId;

    // Verify connection exists
    const connection = await prisma.workspaceConnection.findUnique({
      where: { tenantId },
    });

    if (!connection) {
      return NextResponse.json(
        { error: 'Please complete the connection setup first' },
        { status: 400 }
      );
    }

    // Create default template
    const existingTemplate = await prisma.template.findFirst({
      where: { tenantId, isDefault: true },
    });

    if (!existingTemplate) {
      const template = await prisma.template.create({
        data: {
          tenantId,
          name: 'Company Signature',
          description: 'Default professional email signature',
          htmlContent: getDefaultTemplate(),
          isDefault: true,
          isActive: true,
        },
      });

      // Create default assignment rule
      await prisma.assignmentRule.create({
        data: {
          tenantId,
          templateId: template.id,
          type: 'TENANT_DEFAULT',
          priority: 0,
          isActive: true,
        },
      });

      // Create audit log for template
      await prisma.auditLog.create({
        data: {
          tenantId,
          adminUserId: session.user.id,
          action: 'TEMPLATE_CREATED',
          entityType: 'Template',
          entityId: template.id,
          description: 'Created default signature template',
        },
      });
    }

    // Mark tenant setup as complete
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { setupComplete: true },
    });

    // Trigger initial directory sync if in mock mode
    const mockMode = process.env.MOCK_GOOGLE_MODE === 'true';
    if (mockMode) {
      // Create mock employees
      const mockEmployees = [
        {
          googleId: 'mock-1',
          primaryEmail: 'john.doe@example.com',
          fullName: 'John Doe',
          givenName: 'John',
          familyName: 'Doe',
          title: 'Senior Engineer',
          department: 'Engineering',
          orgUnitPath: '/Engineering',
        },
        {
          googleId: 'mock-2',
          primaryEmail: 'jane.smith@example.com',
          fullName: 'Jane Smith',
          givenName: 'Jane',
          familyName: 'Smith',
          title: 'Marketing Manager',
          department: 'Marketing',
          orgUnitPath: '/Marketing',
        },
        {
          googleId: 'mock-3',
          primaryEmail: 'bob.wilson@example.com',
          fullName: 'Bob Wilson',
          givenName: 'Bob',
          familyName: 'Wilson',
          title: 'Sales Representative',
          department: 'Sales',
          orgUnitPath: '/Sales',
        },
        {
          googleId: 'mock-4',
          primaryEmail: 'alice.johnson@example.com',
          fullName: 'Alice Johnson',
          givenName: 'Alice',
          familyName: 'Johnson',
          title: 'Frontend Developer',
          department: 'Engineering',
          orgUnitPath: '/Engineering/Frontend',
        },
        {
          googleId: 'mock-5',
          primaryEmail: 'charlie.brown@example.com',
          fullName: 'Charlie Brown',
          givenName: 'Charlie',
          familyName: 'Brown',
          title: 'HR Coordinator',
          department: 'Human Resources',
          orgUnitPath: '/HR',
        },
      ];

      for (const emp of mockEmployees) {
        await prisma.employee.upsert({
          where: {
            tenantId_googleId: { tenantId, googleId: emp.googleId },
          },
          create: { tenantId, ...emp },
          update: emp,
        });
      }

      // Update connection sync status
      await prisma.workspaceConnection.update({
        where: { tenantId },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: 'SUCCESS',
          userCount: mockEmployees.length,
        },
      });

      // Create audit log for sync
      await prisma.auditLog.create({
        data: {
          tenantId,
          adminUserId: session.user.id,
          action: 'DIRECTORY_SYNCED',
          entityType: 'Employee',
          description: `Imported ${mockEmployees.length} team members`,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Complete setup error:', error);
    return NextResponse.json({ error: 'Failed to complete setup' }, { status: 500 });
  }
}
