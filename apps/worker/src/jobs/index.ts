import type PgBoss from 'pg-boss';
import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import { directorySync, DIRECTORY_SYNC_QUEUE } from './directory-sync.js';
import { deploySignature, DEPLOY_SIGNATURE_QUEUE } from './deploy-signature.js';
import { deploymentRun, DEPLOYMENT_RUN_QUEUE } from './deployment-run.js';

// Job queue names
export const QUEUES = {
  DIRECTORY_SYNC: DIRECTORY_SYNC_QUEUE,
  DEPLOY_SIGNATURE: DEPLOY_SIGNATURE_QUEUE,
  DEPLOYMENT_RUN: DEPLOYMENT_RUN_QUEUE,
} as const;

// Cron schedules
const CRON_SCHEDULES = {
  // Daily directory sync at 2 AM UTC
  DAILY_DIRECTORY_SYNC: '0 2 * * *',
} as const;

export async function registerJobs(
  boss: PgBoss,
  prisma: PrismaClient,
  logger: Logger
) {
  // Register job handlers
  await boss.work(
    DIRECTORY_SYNC_QUEUE,
    { teamSize: 2, teamConcurrency: 1 },
    directorySync(prisma, logger)
  );
  logger.info({ queue: DIRECTORY_SYNC_QUEUE }, 'Registered directory sync job handler');

  await boss.work(
    DEPLOYMENT_RUN_QUEUE,
    { teamSize: 1, teamConcurrency: 1 },
    deploymentRun(boss, prisma, logger)
  );
  logger.info({ queue: DEPLOYMENT_RUN_QUEUE }, 'Registered deployment run job handler');

  await boss.work(
    DEPLOY_SIGNATURE_QUEUE,
    { teamSize: 5, teamConcurrency: 2 },
    deploySignature(prisma, logger)
  );
  logger.info({ queue: DEPLOY_SIGNATURE_QUEUE }, 'Registered deploy signature job handler');

  // Schedule cron jobs
  await scheduleCronJobs(boss, prisma, logger);
}

async function scheduleCronJobs(
  boss: PgBoss,
  prisma: PrismaClient,
  logger: Logger
) {
  // Get all active tenants and schedule their daily syncs
  const tenants = await prisma.tenant.findMany({
    where: {
      setupComplete: true,
      workspaceConnection: { isNot: null },
    },
    select: { id: true, domain: true },
  });

  for (const tenant of tenants) {
    const scheduleName = `daily-sync-${tenant.id}`;

    await boss.schedule(scheduleName, CRON_SCHEDULES.DAILY_DIRECTORY_SYNC, {
      tenantId: tenant.id,
    }, {
      tz: 'UTC',
    });

    logger.info(
      { tenantId: tenant.id, domain: tenant.domain, scheduleName },
      'Scheduled daily directory sync'
    );
  }

  logger.info({ count: tenants.length }, 'Cron jobs scheduled');
}

// Export types for job payloads
export interface DirectorySyncPayload {
  tenantId: string;
  fullSync?: boolean;
}

export interface DeploymentRunPayload {
  deploymentRunId: string;
  tenantId: string;
}

export interface DeploySignaturePayload {
  deploymentRunId: string;
  employeeId: string;
  tenantId: string;
  templateHtml: string;
  plainText: string | null;
  overwriteStrategy: 'ALWAYS' | 'DRIFT_SAFE';
}
