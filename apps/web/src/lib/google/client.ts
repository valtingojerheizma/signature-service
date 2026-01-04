import { google, admin_directory_v1, gmail_v1 } from 'googleapis';
import { prisma } from '../db';
import { logger } from '../logger';
import { decryptServiceAccountCredentials } from '@signatureops/shared/encryption';
import type { GoogleServiceAccountCredentials } from '@signatureops/shared';

// Required scopes for Domain-Wide Delegation
export const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/admin.directory.user.readonly',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/gmail.settings.sharing',
];

/**
 * Creates an authenticated Google API client for a tenant.
 * Uses Domain-Wide Delegation to impersonate users.
 */
export async function createGoogleClient(
  tenantId: string,
  impersonateEmail?: string
): Promise<{ auth: any; credentials: GoogleServiceAccountCredentials }> {
  const connection = await prisma.workspaceConnection.findUnique({
    where: { tenantId },
    include: { tenant: true },
  });

  if (!connection) {
    throw new GoogleApiError('Workspace connection not found', 'NO_CONNECTION');
  }

  const masterSecret = process.env.ENCRYPTION_MASTER_SECRET;
  if (!masterSecret) {
    throw new GoogleApiError('Encryption configuration error', 'CONFIG_ERROR');
  }

  // Decrypt credentials
  // Note: We need the salt which should be stored - for now assuming it's part of the encrypted data
  // In a full implementation, salt would be stored separately
  let credentials: GoogleServiceAccountCredentials;
  try {
    const decrypted = decryptServiceAccountCredentials(
      {
        ciphertext: connection.encryptedCredentials,
        iv: connection.encryptionIv,
        authTag: connection.encryptionAuthTag,
        keyId: connection.encryptionKeyId,
      },
      connection.encryptionIv, // Using IV as salt for simplicity in this implementation
      masterSecret
    );
    credentials = JSON.parse(decrypted);
  } catch (error) {
    logger.error({ error, tenantId }, 'Failed to decrypt credentials');
    throw new GoogleApiError('Failed to decrypt credentials', 'DECRYPT_ERROR');
  }

  // Create JWT client with impersonation
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: REQUIRED_SCOPES,
    subject: impersonateEmail, // Impersonate this user
  });

  return { auth, credentials };
}

/**
 * Gets the Admin Directory API client.
 */
export async function getDirectoryClient(
  tenantId: string,
  adminEmail: string
): Promise<admin_directory_v1.Admin> {
  const { auth } = await createGoogleClient(tenantId, adminEmail);
  return google.admin({ version: 'directory_v1', auth });
}

/**
 * Gets the Gmail API client for a specific user.
 */
export async function getGmailClient(
  tenantId: string,
  userEmail: string
): Promise<gmail_v1.Gmail> {
  const { auth } = await createGoogleClient(tenantId, userEmail);
  return google.gmail({ version: 'v1', auth });
}

/**
 * Lists users from Google Workspace Directory.
 */
export async function listDirectoryUsers(
  tenantId: string,
  adminEmail: string,
  options: {
    maxResults?: number;
    pageToken?: string;
    query?: string;
  } = {}
): Promise<{
  users: DirectoryUser[];
  nextPageToken?: string;
}> {
  const mockMode = process.env.MOCK_GOOGLE_MODE === 'true';

  if (mockMode) {
    return {
      users: getMockDirectoryUsers(),
      nextPageToken: undefined,
    };
  }

  const directory = await getDirectoryClient(tenantId, adminEmail);

  try {
    const response = await directory.users.list({
      customer: 'my_customer',
      maxResults: options.maxResults || 100,
      pageToken: options.pageToken,
      query: options.query,
      projection: 'full',
      orderBy: 'email',
    });

    const users: DirectoryUser[] = (response.data.users || []).map((user) => ({
      id: user.id!,
      primaryEmail: user.primaryEmail!,
      name: {
        fullName: user.name?.fullName || '',
        givenName: user.name?.givenName,
        familyName: user.name?.familyName,
      },
      orgUnitPath: user.orgUnitPath || '/',
      title: user.organizations?.[0]?.title,
      department: user.organizations?.[0]?.department,
      phone: user.phones?.find((p) => p.type === 'work')?.value,
      mobilePhone: user.phones?.find((p) => p.type === 'mobile')?.value,
      location: user.locations?.[0]?.buildingId,
      thumbnailUrl: user.thumbnailPhotoUrl,
      suspended: user.suspended || false,
    }));

    return {
      users,
      nextPageToken: response.data.nextPageToken || undefined,
    };
  } catch (error: any) {
    logger.error({ error, tenantId }, 'Failed to list directory users');
    throw mapGoogleError(error);
  }
}

/**
 * Gets the current Gmail signature for a user.
 */
export async function getGmailSignature(
  tenantId: string,
  userEmail: string
): Promise<string | null> {
  const mockMode = process.env.MOCK_GOOGLE_MODE === 'true';

  if (mockMode) {
    return '<p>Mock signature</p>';
  }

  const gmail = await getGmailClient(tenantId, userEmail);

  try {
    const response = await gmail.users.settings.sendAs.get({
      userId: 'me',
      sendAsEmail: userEmail,
    });

    return response.data.signature || null;
  } catch (error: any) {
    logger.error({ error, tenantId, userEmail }, 'Failed to get Gmail signature');
    throw mapGoogleError(error);
  }
}

/**
 * Sets the Gmail signature for a user.
 */
export async function setGmailSignature(
  tenantId: string,
  userEmail: string,
  signature: string
): Promise<void> {
  const mockMode = process.env.MOCK_GOOGLE_MODE === 'true';

  if (mockMode) {
    logger.info({ tenantId, userEmail }, 'Mock: Set Gmail signature');
    return;
  }

  const gmail = await getGmailClient(tenantId, userEmail);

  try {
    await gmail.users.settings.sendAs.patch({
      userId: 'me',
      sendAsEmail: userEmail,
      requestBody: {
        signature,
      },
    });

    logger.info({ tenantId, userEmail }, 'Set Gmail signature');
  } catch (error: any) {
    logger.error({ error, tenantId, userEmail }, 'Failed to set Gmail signature');
    throw mapGoogleError(error);
  }
}

/**
 * Tests the connection by attempting to list a few users.
 */
export async function testConnection(
  tenantId: string,
  adminEmail: string
): Promise<{ success: boolean; users?: DirectoryUser[]; error?: string }> {
  try {
    const result = await listDirectoryUsers(tenantId, adminEmail, { maxResults: 5 });
    return { success: true, users: result.users };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Types
export interface DirectoryUser {
  id: string;
  primaryEmail: string;
  name: {
    fullName: string;
    givenName?: string;
    familyName?: string;
  };
  orgUnitPath: string;
  title?: string;
  department?: string;
  phone?: string;
  mobilePhone?: string;
  location?: string;
  thumbnailUrl?: string;
  suspended: boolean;
}

// Error handling
export class GoogleApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'GoogleApiError';
  }
}

function mapGoogleError(error: any): GoogleApiError {
  const status = error.code || error.response?.status;
  const message = error.message || 'Unknown Google API error';

  if (status === 401) {
    return new GoogleApiError(
      'Authentication failed. Please check your service account credentials.',
      'AUTH_FAILED',
      401
    );
  }

  if (status === 403) {
    if (message.includes('insufficient')) {
      return new GoogleApiError(
        'Insufficient permissions. Please verify Domain-Wide Delegation is configured with the required scopes.',
        'INSUFFICIENT_PERMISSIONS',
        403
      );
    }
    return new GoogleApiError(
      'Access denied. Please check that Domain-Wide Delegation is enabled.',
      'ACCESS_DENIED',
      403
    );
  }

  if (status === 404) {
    return new GoogleApiError('Resource not found.', 'NOT_FOUND', 404);
  }

  if (status === 429) {
    return new GoogleApiError(
      'Rate limit exceeded. Please try again later.',
      'RATE_LIMITED',
      429
    );
  }

  return new GoogleApiError(message, 'UNKNOWN_ERROR', status);
}

// Mock data for development
function getMockDirectoryUsers(): DirectoryUser[] {
  return [
    {
      id: 'mock-1',
      primaryEmail: 'john.doe@example.com',
      name: { fullName: 'John Doe', givenName: 'John', familyName: 'Doe' },
      orgUnitPath: '/Engineering',
      title: 'Senior Engineer',
      department: 'Engineering',
      phone: '+1-555-0101',
      suspended: false,
    },
    {
      id: 'mock-2',
      primaryEmail: 'jane.smith@example.com',
      name: { fullName: 'Jane Smith', givenName: 'Jane', familyName: 'Smith' },
      orgUnitPath: '/Marketing',
      title: 'Marketing Manager',
      department: 'Marketing',
      phone: '+1-555-0102',
      suspended: false,
    },
    {
      id: 'mock-3',
      primaryEmail: 'bob.wilson@example.com',
      name: { fullName: 'Bob Wilson', givenName: 'Bob', familyName: 'Wilson' },
      orgUnitPath: '/Sales',
      title: 'Sales Representative',
      department: 'Sales',
      phone: '+1-555-0103',
      mobilePhone: '+1-555-0104',
      suspended: false,
    },
    {
      id: 'mock-4',
      primaryEmail: 'alice.johnson@example.com',
      name: { fullName: 'Alice Johnson', givenName: 'Alice', familyName: 'Johnson' },
      orgUnitPath: '/Engineering/Frontend',
      title: 'Frontend Developer',
      department: 'Engineering',
      suspended: false,
    },
    {
      id: 'mock-5',
      primaryEmail: 'charlie.brown@example.com',
      name: { fullName: 'Charlie Brown', givenName: 'Charlie', familyName: 'Brown' },
      orgUnitPath: '/HR',
      title: 'HR Coordinator',
      department: 'Human Resources',
      suspended: true,
    },
  ];
}
