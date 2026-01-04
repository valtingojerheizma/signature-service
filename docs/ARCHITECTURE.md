# SignatureOps Architecture

## Overview

SignatureOps is a B2B SaaS application for centrally managing Gmail signatures across a Google Workspace organization. It uses Domain-Wide Delegation to securely apply signatures to all users without requiring individual consent.

## User Experience

The product is designed around three simple steps:

1. **Design Signature** - Create a professional email signature template
2. **Choose People** - Import team members from Google Workspace
3. **Apply Changes** - Push signatures to everyone's Gmail

All technical complexity (templates, rules, deployments, APIs) is hidden from the admin user.

## Tech Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Database**: PostgreSQL + Prisma ORM
- **Background Jobs**: pg-boss (Postgres-backed queue)
- **Auth**: NextAuth.js with Google OAuth
- **Billing**: Stripe subscriptions + webhooks
- **Storage**: S3-compatible (MinIO for local development)
- **Logging**: Pino (structured JSON with correlation IDs)

## Monorepo Structure

```
/
├── apps/
│   ├── web/          # Next.js application
│   │   ├── src/
│   │   │   ├── app/           # App Router pages
│   │   │   ├── components/    # React components
│   │   │   └── lib/           # Utilities and config
│   │   └── prisma/            # Database schema
│   └── worker/       # Background job processor
│       └── src/
│           └── jobs/          # Job handlers
├── packages/
│   └── shared/       # Shared utilities
│       └── src/
│           ├── types/         # TypeScript types
│           ├── encryption/    # AES-256-GCM utilities
│           ├── template/      # HTML sanitizer and renderer
│           └── rules/         # Assignment rule engine
├── docs/             # Documentation
└── docker-compose.yml
```

## Core Entities

### Tenant
The organization using SignatureOps. Scopes all data.

### AdminUser
Users who can sign in and manage signatures. Linked to a Tenant.

### WorkspaceConnection
Stores encrypted Google service account credentials for Domain-Wide Delegation.

### Employee
Synced from Google Workspace Directory. Contains name, email, title, department, org unit, and signature deployment status.

### Template
Email signature HTML content with variable placeholders ({{fullName}}, {{title}}, etc.).

### AssignmentRule
Determines which template applies to which employees:
- `TENANT_DEFAULT` - Applies to all employees
- `ORG_UNIT` - Applies to employees in a specific org unit path
- `USER_OVERRIDE` - Applies to a specific employee

Priority: User Override > Org Unit (most specific) > Tenant Default

### DeploymentRun
A batch job to apply signatures. Tracks progress and results.

### DeploymentResult
Individual result for each employee in a deployment run.

### AuditLog
Immutable record of all changes for compliance.

### BillingAccount
Stripe subscription status and trial information.

## Security

### Authentication
- NextAuth.js with Google OAuth provider
- JWT-based sessions stored in secure cookies
- Domain verification ensures users are from a Google Workspace

### Authorization
- All database queries are tenant-scoped via helper function
- Admin users can only access their own tenant's data

### Encryption
- Service account credentials encrypted at rest using AES-256-GCM
- Encryption key derived from master secret using scrypt
- Key ID stored for rotation support

### API Security
- CSRF protection on mutation routes
- Rate limiting on sensitive endpoints
- Input validation using Zod schemas

### Content Security
- HTML signatures sanitized with strict allowlist
- Only HTTPS image URLs allowed
- No scripts, event handlers, or base64 images

## Google Workspace Integration

### Domain-Wide Delegation
Allows the service account to impersonate users and set their Gmail signatures without individual consent.

### Required Scopes
- `https://www.googleapis.com/auth/admin.directory.user.readonly` - Read user directory
- `https://www.googleapis.com/auth/gmail.settings.basic` - Read/write Gmail settings
- `https://www.googleapis.com/auth/gmail.settings.sharing` - Manage send-as aliases

### APIs Used
- **Admin SDK Directory API** - List users with their metadata
- **Gmail API** - Get/set email signatures for send-as addresses

## Background Jobs

Powered by pg-boss, a robust Postgres-backed job queue.

### Job Types

#### directory-sync
Syncs employees from Google Workspace Directory.
- Triggered manually or daily via cron
- Creates/updates Employee records
- Marks suspended users

#### deployment-run
Orchestrates a signature deployment.
- Resolves templates for each employee using rules engine
- Queues individual deploy-signature jobs
- Tracks overall progress

#### deploy-signature
Applies a signature to a single employee's Gmail.
- Supports retry with exponential backoff
- Implements drift-safe mode (skip if user modified signature)
- Updates deployment status

## Deployment Strategies

### Always Overwrite
Default mode. Always applies the current template, regardless of whether the user modified their signature.

### Drift-Safe
Only overwrites if the signature matches the last deployed hash. Respects manual user changes.

## Template System

### Variables
Templates can include placeholders that are replaced with employee data:
- `{{fullName}}` - Full name
- `{{firstName}}` - First name
- `{{lastName}}` - Last name
- `{{title}}` - Job title
- `{{department}}` - Department
- `{{email}}` - Email address
- `{{phone}}` - Work phone
- `{{mobile}}` - Mobile phone
- `{{location}}` - Office location

### HTML Requirements
- Gmail-compatible: table layout, inline styles only
- Max width: 600px
- Allowed tags: table, tbody, tr, td, img, a, span, div, br, b, strong, i, em
- HTTPS-only image URLs
- No scripts or event handlers

## Billing

### Plans
- **Trial** - 14 days free, all features
- **Pro** - $5/user/month (active synced users)

### Stripe Integration
- Checkout sessions for subscription creation
- Webhooks for subscription status updates
- Customer portal for self-service billing management

### Gating
- Deployment actions blocked if trial expired or subscription cancelled
- Read-only access remains available

## Local Development

```bash
# Start all services
docker compose up -d

# Run database migrations
pnpm db:migrate

# Access the app
open http://localhost:3000
```

### Mock Mode
Set `MOCK_GOOGLE_MODE=true` to simulate Google API calls without real credentials. Useful for development and testing.

## Production Deployment

Recommended hosting: Render.com

### Services
- Web Service: Next.js app
- Background Worker: Node.js pg-boss processor
- Database: Managed PostgreSQL
- Storage: AWS S3 or compatible

### Environment Variables
See `.env.example` for required configuration.

## Key Rotation

Service account credentials can be rotated:

1. Generate new encryption key and ID
2. Add new key to environment (keep old key available)
3. Re-encrypt all WorkspaceConnection records
4. Update default key ID
5. Remove old key after transition period

See `packages/shared/src/encryption/index.ts` for detailed steps.

## Monitoring

### Structured Logging
All logs are JSON formatted with:
- Timestamp
- Log level
- Service name
- Correlation ID (for request tracing)
- Context data

### Key Metrics
- Active employees per tenant
- Deployment success rate
- Sync latency
- API error rates

## Future Considerations

### Planned Features
- Group-based assignment rules
- Multiple signature versions per employee
- A/B testing for signatures
- Analytics (signature impressions)

### Schema Extensibility
- AssignmentRule has `RuleType` enum ready for `GROUP` addition
- Template versioning via `version` field
- Metadata JSON fields for extensibility
