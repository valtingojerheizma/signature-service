import type PgBoss from 'pg-boss';
import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import type { DirectorySyncPayload } from './index.js';

export const DIRECTORY_SYNC_QUEUE = 'directory-sync';

export function directorySync(prisma: PrismaClient, parentLogger: Logger) {
  return async (job: PgBoss.Job<DirectorySyncPayload>) => {
    const { tenantId, fullSync = false } = job.data;
    const logger = parentLogger.child({
      jobId: job.id,
      queue: DIRECTORY_SYNC_QUEUE,
      tenantId,
    });

    logger.info({ fullSync }, 'Starting directory sync');

    try {
      // Get workspace connection
      const connection = await prisma.workspaceConnection.findUnique({
        where: { tenantId },
      });

      if (!connection) {
        throw new Error('Workspace connection not found');
      }

      // Check if mock mode is enabled
      const mockMode = process.env.MOCK_GOOGLE_MODE === 'true';

      let users: GoogleDirectoryUser[];

      if (mockMode) {
        logger.info('Using mock Google Directory API');
        users = getMockUsers(tenantId);
      } else {
        // Real Google Directory API call would go here
        // For now, we'll implement this in Milestone 3
        logger.info('Real Google API not yet implemented');
        users = [];
      }

      // Sync users to database
      let created = 0;
      let updated = 0;
      let suspended = 0;

      for (const user of users) {
        const existingEmployee = await prisma.employee.findUnique({
          where: {
            tenantId_googleId: {
              tenantId,
              googleId: user.id,
            },
          },
        });

        const employeeData = {
          primaryEmail: user.primaryEmail,
          fullName: user.name.fullName,
          givenName: user.name.givenName,
          familyName: user.name.familyName,
          title: user.organizations?.[0]?.title || null,
          department: user.organizations?.[0]?.department || null,
          orgUnitPath: user.orgUnitPath || '/',
          phone: user.phones?.[0]?.value || null,
          mobilePhone: user.phones?.find((p) => p.type === 'mobile')?.value || null,
          location: user.locations?.[0]?.buildingId || null,
          thumbnailUrl: user.thumbnailPhotoUrl || null,
          suspended: user.suspended || false,
        };

        if (existingEmployee) {
          await prisma.employee.update({
            where: { id: existingEmployee.id },
            data: employeeData,
          });
          updated++;
          if (employeeData.suspended) suspended++;
        } else {
          await prisma.employee.create({
            data: {
              tenantId,
              googleId: user.id,
              ...employeeData,
            },
          });
          created++;
        }
      }

      // Update connection stats
      await prisma.workspaceConnection.update({
        where: { tenantId },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: 'SUCCESS',
          lastSyncError: null,
          userCount: users.length,
        },
      });

      logger.info(
        { created, updated, suspended, total: users.length },
        'Directory sync completed'
      );

      return { success: true, created, updated, suspended, total: users.length };
    } catch (error) {
      logger.error({ error }, 'Directory sync failed');

      // Update connection with error
      await prisma.workspaceConnection.update({
        where: { tenantId },
        data: {
          lastSyncStatus: 'FAILED',
          lastSyncError: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw error;
    }
  };
}

// Types for Google Directory API response
interface GoogleDirectoryUser {
  id: string;
  primaryEmail: string;
  name: {
    fullName: string;
    givenName?: string;
    familyName?: string;
  };
  orgUnitPath?: string;
  organizations?: Array<{
    title?: string;
    department?: string;
  }>;
  phones?: Array<{
    value: string;
    type?: string;
  }>;
  locations?: Array<{
    buildingId?: string;
  }>;
  thumbnailPhotoUrl?: string;
  suspended?: boolean;
}

// Mock users for development
function getMockUsers(tenantId: string): GoogleDirectoryUser[] {
  return [
    {
      id: 'mock-user-1',
      primaryEmail: 'john.doe@example.com',
      name: { fullName: 'John Doe', givenName: 'John', familyName: 'Doe' },
      orgUnitPath: '/Engineering',
      organizations: [{ title: 'Senior Engineer', department: 'Engineering' }],
      phones: [{ value: '+1-555-0101', type: 'work' }],
      suspended: false,
    },
    {
      id: 'mock-user-2',
      primaryEmail: 'jane.smith@example.com',
      name: { fullName: 'Jane Smith', givenName: 'Jane', familyName: 'Smith' },
      orgUnitPath: '/Marketing',
      organizations: [{ title: 'Marketing Manager', department: 'Marketing' }],
      phones: [{ value: '+1-555-0102', type: 'work' }],
      suspended: false,
    },
    {
      id: 'mock-user-3',
      primaryEmail: 'bob.wilson@example.com',
      name: { fullName: 'Bob Wilson', givenName: 'Bob', familyName: 'Wilson' },
      orgUnitPath: '/Sales',
      organizations: [{ title: 'Sales Representative', department: 'Sales' }],
      phones: [
        { value: '+1-555-0103', type: 'work' },
        { value: '+1-555-0104', type: 'mobile' },
      ],
      suspended: false,
    },
    {
      id: 'mock-user-4',
      primaryEmail: 'alice.johnson@example.com',
      name: { fullName: 'Alice Johnson', givenName: 'Alice', familyName: 'Johnson' },
      orgUnitPath: '/Engineering/Frontend',
      organizations: [{ title: 'Frontend Developer', department: 'Engineering' }],
      suspended: false,
    },
    {
      id: 'mock-user-5',
      primaryEmail: 'charlie.brown@example.com',
      name: { fullName: 'Charlie Brown', givenName: 'Charlie', familyName: 'Brown' },
      orgUnitPath: '/HR',
      organizations: [{ title: 'HR Coordinator', department: 'Human Resources' }],
      suspended: true,
    },
  ];
}
