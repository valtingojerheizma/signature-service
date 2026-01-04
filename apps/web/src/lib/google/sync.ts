import { prisma } from '../db';
import { logger } from '../logger';
import { listDirectoryUsers, type DirectoryUser } from './client';

export interface SyncResult {
  success: boolean;
  created: number;
  updated: number;
  suspended: number;
  total: number;
  errors: string[];
}

/**
 * Syncs all users from Google Directory to the database.
 */
export async function syncDirectory(
  tenantId: string,
  adminEmail: string
): Promise<SyncResult> {
  const log = logger.child({ tenantId, operation: 'directory-sync' });
  log.info('Starting directory sync');

  const result: SyncResult = {
    success: false,
    created: 0,
    updated: 0,
    suspended: 0,
    total: 0,
    errors: [],
  };

  try {
    let pageToken: string | undefined;
    const allUsers: DirectoryUser[] = [];

    // Fetch all pages of users
    do {
      const response = await listDirectoryUsers(tenantId, adminEmail, {
        maxResults: 100,
        pageToken,
      });

      allUsers.push(...response.users);
      pageToken = response.nextPageToken;

      log.debug({ count: response.users.length, total: allUsers.length }, 'Fetched users page');
    } while (pageToken);

    log.info({ total: allUsers.length }, 'Fetched all users from directory');

    // Sync each user to database
    for (const user of allUsers) {
      try {
        const employeeData = {
          primaryEmail: user.primaryEmail,
          fullName: user.name.fullName,
          givenName: user.name.givenName || null,
          familyName: user.name.familyName || null,
          title: user.title || null,
          department: user.department || null,
          orgUnitPath: user.orgUnitPath,
          phone: user.phone || null,
          mobilePhone: user.mobilePhone || null,
          location: user.location || null,
          thumbnailUrl: user.thumbnailUrl || null,
          suspended: user.suspended,
        };

        const existing = await prisma.employee.findUnique({
          where: {
            tenantId_googleId: { tenantId, googleId: user.id },
          },
        });

        if (existing) {
          await prisma.employee.update({
            where: { id: existing.id },
            data: employeeData,
          });
          result.updated++;
        } else {
          await prisma.employee.create({
            data: {
              tenantId,
              googleId: user.id,
              ...employeeData,
            },
          });
          result.created++;
        }

        if (user.suspended) {
          result.suspended++;
        }
      } catch (error: any) {
        log.error({ error, email: user.primaryEmail }, 'Failed to sync user');
        result.errors.push(`Failed to sync ${user.primaryEmail}: ${error.message}`);
      }
    }

    result.total = allUsers.length;
    result.success = result.errors.length === 0;

    // Update workspace connection stats
    await prisma.workspaceConnection.update({
      where: { tenantId },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: result.success ? 'SUCCESS' : 'PARTIAL',
        lastSyncError: result.errors.length > 0 ? result.errors.join('; ') : null,
        userCount: result.total,
      },
    });

    log.info(result, 'Directory sync completed');
    return result;
  } catch (error: any) {
    log.error({ error }, 'Directory sync failed');

    await prisma.workspaceConnection.update({
      where: { tenantId },
      data: {
        lastSyncStatus: 'FAILED',
        lastSyncError: error.message,
      },
    });

    result.errors.push(error.message);
    return result;
  }
}

/**
 * Gets sync status for a tenant.
 */
export async function getSyncStatus(tenantId: string) {
  const connection = await prisma.workspaceConnection.findUnique({
    where: { tenantId },
    select: {
      lastSyncAt: true,
      lastSyncStatus: true,
      lastSyncError: true,
      userCount: true,
    },
  });

  if (!connection) {
    return null;
  }

  return {
    lastSyncAt: connection.lastSyncAt,
    status: connection.lastSyncStatus,
    error: connection.lastSyncError,
    userCount: connection.userCount,
  };
}
