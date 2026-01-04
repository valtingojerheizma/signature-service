import type PgBoss from 'pg-boss';
import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import { createHash } from 'crypto';
import type { DeploySignaturePayload } from './index.js';

export const DEPLOY_SIGNATURE_QUEUE = 'deploy-signature';

export function deploySignature(prisma: PrismaClient, parentLogger: Logger) {
  return async (job: PgBoss.Job<DeploySignaturePayload>) => {
    const {
      deploymentRunId,
      employeeId,
      tenantId,
      templateHtml,
      plainText,
      overwriteStrategy,
    } = job.data;

    const logger = parentLogger.child({
      jobId: job.id,
      queue: DEPLOY_SIGNATURE_QUEUE,
      deploymentRunId,
      employeeId,
      tenantId,
    });

    logger.info('Deploying signature');

    try {
      // Get employee
      const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
      });

      if (!employee) {
        throw new Error('Employee not found');
      }

      if (employee.tenantId !== tenantId) {
        throw new Error('Tenant mismatch');
      }

      // Calculate signature hash
      const signatureHash = createHash('sha256')
        .update(templateHtml)
        .digest('hex')
        .substring(0, 16);

      // Check drift-safe strategy
      if (overwriteStrategy === 'DRIFT_SAFE') {
        if (
          employee.lastDeployedHash &&
          employee.currentSignatureHash &&
          employee.lastDeployedHash !== employee.currentSignatureHash
        ) {
          // Signature was modified since last deployment - skip
          logger.info(
            {
              lastDeployedHash: employee.lastDeployedHash,
              currentSignatureHash: employee.currentSignatureHash,
            },
            'Skipping due to drift-safe strategy'
          );

          await prisma.deploymentResult.create({
            data: {
              deploymentRunId,
              employeeId,
              status: 'SKIPPED',
              signatureHash,
              retriesUsed: 0,
            },
          });

          await updateDeploymentRunStats(prisma, deploymentRunId, 'SKIPPED');

          return { success: true, skipped: true, reason: 'drift-detected' };
        }
      }

      // Check if mock mode is enabled
      const mockMode = process.env.MOCK_GOOGLE_MODE === 'true';

      if (mockMode) {
        logger.info(
          { email: employee.primaryEmail },
          'Mock mode: simulating signature deployment'
        );
        // Simulate API call delay
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        // Real Gmail API call would go here
        // For now, we'll implement this in Milestone 3
        logger.info('Real Google API not yet implemented');
      }

      // Update employee with deployed signature info
      await prisma.employee.update({
        where: { id: employeeId },
        data: {
          lastDeployedAt: new Date(),
          lastDeployedHash: signatureHash,
          currentSignatureHash: signatureHash,
        },
      });

      // Record success
      await prisma.deploymentResult.create({
        data: {
          deploymentRunId,
          employeeId,
          status: 'SUCCESS',
          signatureHash,
          retriesUsed: job.retrylimit ? job.retrylimit - (job.retrycount || 0) : 0,
        },
      });

      await updateDeploymentRunStats(prisma, deploymentRunId, 'SUCCESS');

      logger.info({ signatureHash }, 'Signature deployed successfully');

      return { success: true, signatureHash };
    } catch (error) {
      logger.error({ error }, 'Failed to deploy signature');

      // Record failure
      await prisma.deploymentResult.create({
        data: {
          deploymentRunId,
          employeeId,
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          retriesUsed: job.retrylimit ? job.retrylimit - (job.retrycount || 0) : 0,
        },
      });

      await updateDeploymentRunStats(prisma, deploymentRunId, 'FAILED');

      throw error;
    }
  };
}

async function updateDeploymentRunStats(
  prisma: PrismaClient,
  deploymentRunId: string,
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED'
) {
  const updateData: Record<string, { increment: number }> = {};

  if (status === 'SUCCESS') {
    updateData.successCount = { increment: 1 };
  } else if (status === 'FAILED') {
    updateData.failureCount = { increment: 1 };
  } else if (status === 'SKIPPED') {
    updateData.skippedCount = { increment: 1 };
  }

  const run = await prisma.deploymentRun.update({
    where: { id: deploymentRunId },
    data: updateData,
  });

  // Check if deployment is complete
  const totalProcessed = run.successCount + run.failureCount + run.skippedCount;
  if (totalProcessed >= run.totalUsers && run.status === 'RUNNING') {
    await prisma.deploymentRun.update({
      where: { id: deploymentRunId },
      data: {
        status: run.failureCount > 0 ? 'FAILED' : 'COMPLETED',
        completedAt: new Date(),
      },
    });
  }
}
