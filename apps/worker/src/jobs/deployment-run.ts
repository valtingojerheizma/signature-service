import type PgBoss from 'pg-boss';
import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import type { DeploymentRunPayload, DeploySignaturePayload } from './index.js';
import { DEPLOY_SIGNATURE_QUEUE } from './deploy-signature.js';

export const DEPLOYMENT_RUN_QUEUE = 'deployment-run';

export function deploymentRun(
  boss: PgBoss,
  prisma: PrismaClient,
  parentLogger: Logger
) {
  return async (job: PgBoss.Job<DeploymentRunPayload>) => {
    const { deploymentRunId, tenantId } = job.data;
    const logger = parentLogger.child({
      jobId: job.id,
      queue: DEPLOYMENT_RUN_QUEUE,
      deploymentRunId,
      tenantId,
    });

    logger.info('Starting deployment run');

    try {
      // Get deployment run
      const run = await prisma.deploymentRun.findUnique({
        where: { id: deploymentRunId },
        include: { tenant: true },
      });

      if (!run) {
        throw new Error('Deployment run not found');
      }

      if (run.tenantId !== tenantId) {
        throw new Error('Tenant mismatch');
      }

      if (run.status !== 'PENDING') {
        logger.warn({ status: run.status }, 'Deployment run not in PENDING state');
        return { skipped: true, reason: 'Not in PENDING state' };
      }

      // Mark as running
      await prisma.deploymentRun.update({
        where: { id: deploymentRunId },
        data: { status: 'RUNNING', startedAt: new Date() },
      });

      // Get employees that need deployment
      const employees = await prisma.employee.findMany({
        where: {
          tenantId,
          suspended: false,
        },
      });

      logger.info({ employeeCount: employees.length }, 'Found employees for deployment');

      // For each employee, determine their template and queue individual deploy jobs
      let queuedCount = 0;

      for (const employee of employees) {
        // Get the template for this employee based on assignment rules
        const template = await getTemplateForEmployee(prisma, tenantId, employee.id);

        if (!template) {
          logger.warn(
            { employeeId: employee.id, email: employee.primaryEmail },
            'No template found for employee'
          );
          continue;
        }

        // Render the template with employee data
        const { html, plainText } = await renderTemplateForEmployee(
          prisma,
          template,
          employee
        );

        // Queue individual deploy job
        const payload: DeploySignaturePayload = {
          deploymentRunId,
          employeeId: employee.id,
          tenantId,
          templateHtml: html,
          plainText,
          overwriteStrategy: run.overwriteStrategy,
        };

        await boss.send(DEPLOY_SIGNATURE_QUEUE, payload, {
          retryLimit: 3,
          retryDelay: 60,
          retryBackoff: true,
        });

        queuedCount++;
      }

      // Update total users count
      await prisma.deploymentRun.update({
        where: { id: deploymentRunId },
        data: { totalUsers: queuedCount },
      });

      logger.info({ queuedCount }, 'Deployment jobs queued');

      return { success: true, queuedCount };
    } catch (error) {
      logger.error({ error }, 'Deployment run failed to start');

      await prisma.deploymentRun.update({
        where: { id: deploymentRunId },
        data: { status: 'FAILED', completedAt: new Date() },
      });

      throw error;
    }
  };
}

// Get the best matching template for an employee
async function getTemplateForEmployee(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string
): Promise<{
  id: string;
  htmlContent: string;
  plainText: string | null;
} | null> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  });

  if (!employee) return null;

  // Priority 1: User override
  const userOverride = await prisma.assignmentRule.findFirst({
    where: {
      tenantId,
      type: 'USER_OVERRIDE',
      employeeId,
      isActive: true,
    },
    include: { template: true },
  });

  if (userOverride?.template?.isActive) {
    return {
      id: userOverride.template.id,
      htmlContent: userOverride.template.htmlContent,
      plainText: userOverride.template.plainText,
    };
  }

  // Priority 2: Org unit (find most specific match)
  const orgUnitRules = await prisma.assignmentRule.findMany({
    where: {
      tenantId,
      type: 'ORG_UNIT',
      isActive: true,
    },
    include: { template: true },
    orderBy: { priority: 'desc' },
  });

  // Find the most specific org unit match
  let bestMatch: (typeof orgUnitRules)[0] | null = null;
  let bestMatchLength = 0;

  for (const rule of orgUnitRules) {
    if (
      rule.orgUnitPath &&
      employee.orgUnitPath.startsWith(rule.orgUnitPath) &&
      rule.orgUnitPath.length > bestMatchLength &&
      rule.template?.isActive
    ) {
      bestMatch = rule;
      bestMatchLength = rule.orgUnitPath.length;
    }
  }

  if (bestMatch?.template) {
    return {
      id: bestMatch.template.id,
      htmlContent: bestMatch.template.htmlContent,
      plainText: bestMatch.template.plainText,
    };
  }

  // Priority 3: Tenant default
  const defaultRule = await prisma.assignmentRule.findFirst({
    where: {
      tenantId,
      type: 'TENANT_DEFAULT',
      isActive: true,
    },
    include: { template: true },
  });

  if (defaultRule?.template?.isActive) {
    return {
      id: defaultRule.template.id,
      htmlContent: defaultRule.template.htmlContent,
      plainText: defaultRule.template.plainText,
    };
  }

  // Fallback: default template
  const defaultTemplate = await prisma.template.findFirst({
    where: {
      tenantId,
      isDefault: true,
      isActive: true,
    },
  });

  if (defaultTemplate) {
    return {
      id: defaultTemplate.id,
      htmlContent: defaultTemplate.htmlContent,
      plainText: defaultTemplate.plainText,
    };
  }

  return null;
}

// Render template with employee data
async function renderTemplateForEmployee(
  prisma: PrismaClient,
  template: { id: string; htmlContent: string; plainText: string | null },
  employee: {
    fullName: string;
    givenName: string | null;
    familyName: string | null;
    title: string | null;
    department: string | null;
    primaryEmail: string;
    phone: string | null;
    mobilePhone: string | null;
    location: string | null;
  }
): Promise<{ html: string; plainText: string | null }> {
  // Variable mapping
  const variables: Record<string, string> = {
    '{{fullName}}': employee.fullName || '',
    '{{firstName}}': employee.givenName || '',
    '{{lastName}}': employee.familyName || '',
    '{{title}}': employee.title || '',
    '{{department}}': employee.department || '',
    '{{email}}': employee.primaryEmail || '',
    '{{phone}}': employee.phone || '',
    '{{mobile}}': employee.mobilePhone || '',
    '{{location}}': employee.location || '',
  };

  let html = template.htmlContent;
  let plainText = template.plainText;

  // Replace variables
  for (const [variable, value] of Object.entries(variables)) {
    html = html.replace(new RegExp(escapeRegExp(variable), 'g'), value);
    if (plainText) {
      plainText = plainText.replace(new RegExp(escapeRegExp(variable), 'g'), value);
    }
  }

  return { html, plainText };
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
