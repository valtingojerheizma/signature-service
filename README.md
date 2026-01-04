# SignatureOps

Centrally manage Gmail signatures for your entire Google Workspace organization.

## Features

- **Design Once, Apply Everywhere** - Create a professional signature template with your branding
- **Automatic Personalization** - Names, titles, and contact info filled in from your directory
- **One-Click Updates** - Apply changes to everyone instantly
- **Always In Sync** - Daily sync keeps team info up to date

## Quick Start

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- pnpm (`npm install -g pnpm`)

### Local Development

1. **Clone and install dependencies**

```bash
git clone <repo-url>
cd signature-service
pnpm install
```

2. **Set up environment**

```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Start services**

```bash
docker compose up -d
```

4. **Run database migrations**

```bash
pnpm db:migrate
```

5. **Start the development server**

```bash
pnpm dev
```

6. **Open the app**

Visit [http://localhost:3000](http://localhost:3000)

### Mock Mode

For development without Google credentials, set `MOCK_GOOGLE_MODE=true` in your `.env` file. This simulates the Google Directory and Gmail APIs with sample data.

## Google Workspace Setup

To use SignatureOps with real Google Workspace data:

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project
3. Enable the following APIs:
   - Admin SDK API
   - Gmail API

### 2. Create OAuth Credentials (for admin sign-in)

1. Go to APIs & Services > Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
4. Copy Client ID and Secret to your `.env` file

### 3. Create a Service Account (for Domain-Wide Delegation)

1. Go to APIs & Services > Credentials
2. Create Service Account
3. Create and download a JSON key
4. Note the service account email

### 4. Set Up Domain-Wide Delegation

1. Go to [Google Admin Console](https://admin.google.com)
2. Navigate to Security > API Controls > Domain-wide Delegation
3. Click "Add new"
4. Enter the service account Client ID
5. Add these scopes:
   ```
   https://www.googleapis.com/auth/admin.directory.user.readonly
   https://www.googleapis.com/auth/gmail.settings.basic
   https://www.googleapis.com/auth/gmail.settings.sharing
   ```
6. Click Authorize

### 5. Upload Service Account in SignatureOps

1. Sign in to SignatureOps
2. Go through the setup wizard
3. Upload the service account JSON file
4. Test the connection

## Stripe Setup

### 1. Create a Stripe Account

Sign up at [stripe.com](https://stripe.com) if you haven't already.

### 2. Create a Product and Price

1. Go to Products in the Stripe Dashboard
2. Create a product (e.g., "SignatureOps Pro")
3. Add a recurring price (e.g., $5/month)
4. Copy the Price ID to your `.env` file

### 3. Set Up Webhooks

1. Go to Developers > Webhooks
2. Add endpoint: `https://your-domain.com/api/webhooks/stripe`
3. Select events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy the webhook secret to your `.env` file

## Production Deployment

### Render.com (Recommended)

1. **Create services**:
   - Web Service: Connect your repo, set root to `/`
   - Background Worker: Same repo, start command `pnpm --filter @signatureops/worker start`
   - PostgreSQL: Managed database

2. **Set environment variables** from your `.env` file

3. **Add a build command**:
   ```bash
   pnpm install && pnpm build && pnpm db:migrate
   ```

4. **Configure S3** for production asset storage

### Other Platforms

SignatureOps can run on any platform that supports Node.js and PostgreSQL:
- Vercel (web) + Railway (worker + database)
- AWS (ECS, RDS)
- Google Cloud Run + Cloud SQL

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| "Insufficient permissions" | DWD scopes not configured | Verify scopes in Admin Console |
| "Domain not found" | Wrong domain in service account | Check service account has access to your domain |
| "Rate limit exceeded" | Too many API calls | Reduce batch size or add delays |
| "Invalid grant" | Service account key issues | Create a new key and re-upload |
| "User not found" | User suspended or deleted | Refresh team list |

## Project Structure

```
/
├── apps/
│   ├── web/          # Next.js frontend + API
│   └── worker/       # Background job processor
├── packages/
│   └── shared/       # Shared utilities
├── docs/             # Documentation
└── docker-compose.yml
```

## Commands

```bash
# Development
pnpm dev              # Start all apps in dev mode
pnpm build            # Build all apps
pnpm test             # Run tests

# Database
pnpm db:migrate       # Run migrations
pnpm db:push          # Push schema (dev only)
pnpm db:studio        # Open Prisma Studio

# Docker
pnpm docker:up        # Start Docker services
pnpm docker:down      # Stop Docker services
pnpm docker:logs      # View logs
```

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed technical documentation.

## License

MIT
