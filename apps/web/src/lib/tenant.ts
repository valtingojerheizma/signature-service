import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { prisma } from './db';

/**
 * Gets the current tenant ID from the session.
 * Throws an error if not authenticated or no tenant.
 */
export async function requireTenantId(): Promise<string> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new TenantError('Not authenticated', 'UNAUTHORIZED');
  }

  if (!session.user.tenantId) {
    throw new TenantError('No organization configured', 'NO_TENANT');
  }

  return session.user.tenantId;
}

/**
 * Gets the current session with tenant validation.
 */
export async function requireSession() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new TenantError('Not authenticated', 'UNAUTHORIZED');
  }

  return session;
}

/**
 * Tenant-scoped query helper.
 * Ensures all queries include the tenant ID filter.
 */
export function tenantScope<T extends { tenantId: string }>(
  tenantId: string,
  where: Partial<T>
): T {
  return { ...where, tenantId } as T;
}

/**
 * Validates that an entity belongs to the given tenant.
 */
export async function validateTenantAccess(
  tenantId: string,
  entityType: 'template' | 'employee' | 'rule' | 'deployment',
  entityId: string
): Promise<boolean> {
  switch (entityType) {
    case 'template':
      const template = await prisma.template.findUnique({
        where: { id: entityId },
        select: { tenantId: true },
      });
      return template?.tenantId === tenantId;

    case 'employee':
      const employee = await prisma.employee.findUnique({
        where: { id: entityId },
        select: { tenantId: true },
      });
      return employee?.tenantId === tenantId;

    case 'rule':
      const rule = await prisma.assignmentRule.findUnique({
        where: { id: entityId },
        select: { tenantId: true },
      });
      return rule?.tenantId === tenantId;

    case 'deployment':
      const deployment = await prisma.deploymentRun.findUnique({
        where: { id: entityId },
        select: { tenantId: true },
      });
      return deployment?.tenantId === tenantId;

    default:
      return false;
  }
}

/**
 * Custom error class for tenant-related errors.
 */
export class TenantError extends Error {
  constructor(
    message: string,
    public code: 'UNAUTHORIZED' | 'NO_TENANT' | 'FORBIDDEN' | 'NOT_FOUND'
  ) {
    super(message);
    this.name = 'TenantError';
  }
}

/**
 * Audit log helper - always tenant-scoped.
 */
export async function createAuditLog(
  tenantId: string,
  adminUserId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  description: string,
  metadata?: Record<string, unknown>,
  request?: Request
) {
  return prisma.auditLog.create({
    data: {
      tenantId,
      adminUserId,
      action: action as any,
      entityType,
      entityId,
      description,
      metadata,
      ipAddress: request?.headers.get('x-forwarded-for') || null,
      userAgent: request?.headers.get('user-agent') || null,
    },
  });
}
