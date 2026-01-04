import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.tenantId) {
      return NextResponse.redirect(new URL('/auth/signin', request.url));
    }

    const tenantId = session.user.tenantId;

    // Check billing status
    const billing = await prisma.billingAccount.findUnique({
      where: { tenantId },
    });

    if (billing) {
      if (billing.status === 'EXPIRED' || billing.status === 'CANCELLED') {
        return NextResponse.redirect(
          new URL('/dashboard/settings?error=billing', request.url)
        );
      }
      if (billing.plan === 'TRIAL' && billing.trialEndsAt && billing.trialEndsAt < new Date()) {
        return NextResponse.redirect(
          new URL('/dashboard/settings?error=trial_expired', request.url)
        );
      }
    }

    // Get active employees count
    const employeeCount = await prisma.employee.count({
      where: { tenantId, suspended: false },
    });

    if (employeeCount === 0) {
      return NextResponse.redirect(
        new URL('/dashboard/people?error=no_employees', request.url)
      );
    }

    // Create deployment run
    const deploymentRun = await prisma.deploymentRun.create({
      data: {
        tenantId,
        status: 'PENDING',
        overwriteStrategy: 'ALWAYS',
        totalUsers: employeeCount,
        triggeredBy: session.user.id,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        tenantId,
        adminUserId: session.user.id,
        action: 'DEPLOYMENT_STARTED',
        entityType: 'DeploymentRun',
        entityId: deploymentRun.id,
        description: `Started applying signatures to ${employeeCount} people`,
      },
    });

    // In mock mode, simulate immediate completion
    const mockMode = process.env.MOCK_GOOGLE_MODE === 'true';
    if (mockMode) {
      // Get all active employees
      const employees = await prisma.employee.findMany({
        where: { tenantId, suspended: false },
      });

      // Create results for each
      for (const employee of employees) {
        await prisma.deploymentResult.create({
          data: {
            deploymentRunId: deploymentRun.id,
            employeeId: employee.id,
            status: 'SUCCESS',
            signatureHash: 'mock-hash-' + Date.now(),
          },
        });

        // Update employee
        await prisma.employee.update({
          where: { id: employee.id },
          data: {
            lastDeployedAt: new Date(),
            lastDeployedHash: 'mock-hash-' + Date.now(),
            currentSignatureHash: 'mock-hash-' + Date.now(),
          },
        });
      }

      // Mark deployment as complete
      await prisma.deploymentRun.update({
        where: { id: deploymentRun.id },
        data: {
          status: 'COMPLETED',
          successCount: employees.length,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });

      // Create completion audit log
      await prisma.auditLog.create({
        data: {
          tenantId,
          adminUserId: session.user.id,
          action: 'DEPLOYMENT_COMPLETED',
          entityType: 'DeploymentRun',
          entityId: deploymentRun.id,
          description: `Applied signatures to ${employees.length} people`,
        },
      });
    }

    // Redirect back to dashboard
    return NextResponse.redirect(new URL('/dashboard?success=applied', request.url));
  } catch (error) {
    console.error('Apply signatures error:', error);
    return NextResponse.redirect(new URL('/dashboard?error=apply_failed', request.url));
  }
}
