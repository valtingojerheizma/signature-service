import { z } from 'zod';

// ============================================================================
// Common Types
// ============================================================================

export type TenantId = string;
export type UserId = string;
export type EmployeeId = string;
export type TemplateId = string;

// ============================================================================
// Template Variables
// ============================================================================

export const TEMPLATE_VARIABLES = [
  { key: '{{fullName}}', label: 'Full Name', description: "Employee's full name" },
  { key: '{{firstName}}', label: 'First Name', description: "Employee's first name" },
  { key: '{{lastName}}', label: 'Last Name', description: "Employee's last name" },
  { key: '{{title}}', label: 'Job Title', description: "Employee's job title" },
  { key: '{{department}}', label: 'Department', description: "Employee's department" },
  { key: '{{email}}', label: 'Email', description: "Employee's email address" },
  { key: '{{phone}}', label: 'Phone', description: "Employee's work phone" },
  { key: '{{mobile}}', label: 'Mobile', description: "Employee's mobile phone" },
  { key: '{{location}}', label: 'Location', description: "Employee's office location" },
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number]['key'];

// ============================================================================
// Google Workspace Types
// ============================================================================

export interface GoogleServiceAccountCredentials {
  type: 'service_account';
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

export const GoogleServiceAccountSchema = z.object({
  type: z.literal('service_account'),
  project_id: z.string(),
  private_key_id: z.string(),
  private_key: z.string(),
  client_email: z.string().email(),
  client_id: z.string(),
  auth_uri: z.string().url(),
  token_uri: z.string().url(),
  auth_provider_x509_cert_url: z.string().url(),
  client_x509_cert_url: z.string().url(),
});

// Required DWD scopes
export const REQUIRED_GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/admin.directory.user.readonly',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/gmail.settings.sharing',
] as const;

// ============================================================================
// Employee Types
// ============================================================================

export interface EmployeeData {
  id: string;
  primaryEmail: string;
  fullName: string;
  givenName?: string | null;
  familyName?: string | null;
  title?: string | null;
  department?: string | null;
  orgUnitPath: string;
  phone?: string | null;
  mobilePhone?: string | null;
  location?: string | null;
  thumbnailUrl?: string | null;
  suspended: boolean;
}

// ============================================================================
// Template Types
// ============================================================================

export interface TemplateData {
  id: string;
  name: string;
  description?: string | null;
  htmlContent: string;
  plainText?: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export const TemplateCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  htmlContent: z.string().min(1),
});

export const TemplateUpdateSchema = TemplateCreateSchema.partial();

// ============================================================================
// Assignment Rule Types
// ============================================================================

export type RuleType = 'TENANT_DEFAULT' | 'ORG_UNIT' | 'USER_OVERRIDE';

export interface AssignmentRuleData {
  id: string;
  type: RuleType;
  templateId: string;
  priority: number;
  orgUnitPath?: string | null;
  employeeId?: string | null;
  isActive: boolean;
}

export const AssignmentRuleCreateSchema = z.object({
  templateId: z.string().cuid(),
  type: z.enum(['TENANT_DEFAULT', 'ORG_UNIT', 'USER_OVERRIDE']),
  orgUnitPath: z.string().optional(),
  employeeId: z.string().cuid().optional(),
  priority: z.number().int().min(0).default(0),
});

// ============================================================================
// Deployment Types
// ============================================================================

export type DeploymentStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type OverwriteStrategy = 'ALWAYS' | 'DRIFT_SAFE';
export type ResultStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';

export interface DeploymentRunData {
  id: string;
  status: DeploymentStatus;
  overwriteStrategy: OverwriteStrategy;
  totalUsers: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  startedAt?: Date | null;
  completedAt?: Date | null;
}

export const DeploymentCreateSchema = z.object({
  overwriteStrategy: z.enum(['ALWAYS', 'DRIFT_SAFE']).default('ALWAYS'),
  employeeIds: z.array(z.string().cuid()).optional(), // If not provided, deploy to all
});

// ============================================================================
// Billing Types
// ============================================================================

export type BillingPlan = 'TRIAL' | 'PRO';
export type BillingStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';

export interface BillingAccountData {
  id: string;
  plan: BillingPlan;
  status: BillingStatus;
  trialEndsAt?: Date | null;
  currentPeriodEnd?: Date | null;
  activeUserCount: number;
}

// Trial duration in days
export const TRIAL_DURATION_DAYS = 14;

// ============================================================================
// Audit Log Types
// ============================================================================

export type AuditAction =
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'TENANT_CREATED'
  | 'TENANT_UPDATED'
  | 'WORKSPACE_CONNECTED'
  | 'WORKSPACE_UPDATED'
  | 'DIRECTORY_SYNCED'
  | 'TEMPLATE_CREATED'
  | 'TEMPLATE_UPDATED'
  | 'TEMPLATE_DELETED'
  | 'TEMPLATE_ASSET_UPLOADED'
  | 'RULE_CREATED'
  | 'RULE_UPDATED'
  | 'RULE_DELETED'
  | 'DEPLOYMENT_STARTED'
  | 'DEPLOYMENT_COMPLETED'
  | 'DEPLOYMENT_FAILED'
  | 'SUBSCRIPTION_CREATED'
  | 'SUBSCRIPTION_UPDATED'
  | 'SUBSCRIPTION_CANCELLED';

export interface AuditLogEntry {
  action: AuditAction;
  entityType: string;
  entityId?: string;
  description: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============================================================================
// Error Codes
// ============================================================================

export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  BILLING_REQUIRED: 'BILLING_REQUIRED',
  SETUP_INCOMPLETE: 'SETUP_INCOMPLETE',
  GOOGLE_API_ERROR: 'GOOGLE_API_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
