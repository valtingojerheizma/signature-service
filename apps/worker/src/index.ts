import PgBoss from 'pg-boss';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import { registerJobs } from './jobs/index.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'signatureops-worker',
    env: process.env.NODE_ENV || 'development',
  },
});

const prisma = new PrismaClient();

async function main() {
  logger.info('Starting SignatureOps worker...');

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const boss = new PgBoss({
    connectionString,
    schema: 'pgboss',
    noScheduling: false,
    retryLimit: 3,
    retryDelay: 60, // 1 minute
    retryBackoff: true,
    expireInHours: 24,
    archiveCompletedAfterSeconds: 60 * 60 * 24 * 7, // 7 days
    deleteAfterSeconds: 60 * 60 * 24 * 30, // 30 days
  });

  boss.on('error', (error) => {
    logger.error({ error }, 'pg-boss error');
  });

  boss.on('monitor-states', (states) => {
    logger.debug({ states }, 'Job queue states');
  });

  await boss.start();
  logger.info('pg-boss started');

  // Register all job handlers
  await registerJobs(boss, prisma, logger);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal');

    try {
      await boss.stop({ graceful: true, timeout: 30000 });
      await prisma.$disconnect();
      logger.info('Worker shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  logger.info('Worker is ready and listening for jobs');
}

main().catch((error) => {
  logger.error({ error }, 'Worker failed to start');
  process.exit(1);
});
