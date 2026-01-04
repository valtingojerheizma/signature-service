import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import Link from 'next/link';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const tenantId = session?.user?.tenantId;

  // Fetch dashboard data
  const [tenant, employeeStats, defaultTemplate, lastActivity] = await Promise.all([
    tenantId
      ? prisma.tenant.findUnique({
          where: { id: tenantId },
          include: { workspaceConnection: true },
        })
      : null,
    tenantId
      ? prisma.employee.groupBy({
          by: ['suspended'],
          where: { tenantId },
          _count: true,
        })
      : [],
    tenantId
      ? prisma.template.findFirst({
          where: { tenantId, isDefault: true, isActive: true },
        })
      : null,
    tenantId
      ? prisma.deploymentRun.findFirst({
          where: { tenantId, status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
        })
      : null,
  ]);

  const activeCount = employeeStats.find((s) => !s.suspended)?._count ?? 0;
  const totalCount = employeeStats.reduce((sum, s) => sum + s._count, 0);
  const signedCount = lastActivity?.successCount ?? 0;
  const pendingCount = activeCount - signedCount;

  const hasSignature = !!defaultTemplate;
  const hasTeam = totalCount > 0;
  const isUpToDate = pendingCount === 0 && signedCount > 0;

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome{session?.user?.name ? `, ${session.user.name.split(' ')[0]}` : ''}
        </h1>
        <p className="mt-1 text-gray-500">
          Manage your company's email signature in three simple steps.
        </p>
      </div>

      {/* Status Overview */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Step 1: Signature */}
        <Link
          href="/dashboard/signature"
          className={`card p-6 hover:shadow-md transition-shadow border-l-4 ${
            hasSignature ? 'border-l-green-500' : 'border-l-gray-300'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${
                    hasSignature
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  1
                </span>
                <h3 className="font-semibold text-gray-900">Design Signature</h3>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                {hasSignature
                  ? `Using "${defaultTemplate.name}"`
                  : 'Create your company email signature'}
              </p>
            </div>
            {hasSignature && (
              <svg
                className="w-5 h-5 text-green-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </div>
        </Link>

        {/* Step 2: Team */}
        <Link
          href="/dashboard/people"
          className={`card p-6 hover:shadow-md transition-shadow border-l-4 ${
            hasTeam ? 'border-l-green-500' : 'border-l-gray-300'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${
                    hasTeam
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  2
                </span>
                <h3 className="font-semibold text-gray-900">Choose People</h3>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                {hasTeam
                  ? `${activeCount} team member${activeCount !== 1 ? 's' : ''} synced`
                  : 'Connect to import your team'}
              </p>
            </div>
            {hasTeam && (
              <svg
                className="w-5 h-5 text-green-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </div>
        </Link>

        {/* Step 3: Apply */}
        <div
          className={`card p-6 border-l-4 ${
            isUpToDate ? 'border-l-green-500' : 'border-l-amber-400'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${
                    isUpToDate
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  3
                </span>
                <h3 className="font-semibold text-gray-900">Apply Changes</h3>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                {isUpToDate
                  ? 'All signatures are up to date'
                  : pendingCount > 0
                  ? `${pendingCount} signature${pendingCount !== 1 ? 's' : ''} pending`
                  : 'Ready to apply when you are'}
              </p>
            </div>
            {isUpToDate ? (
              <svg
                className="w-5 h-5 text-green-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <form action="/api/signatures/apply" method="POST">
                <button
                  type="submit"
                  className="btn-primary text-sm"
                  disabled={!hasSignature || !hasTeam}
                >
                  Apply Now
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Main action card */}
      {hasSignature && hasTeam && (
        <div className="card p-8 text-center">
          <h2 className="text-xl font-semibold text-gray-900">
            {isUpToDate ? 'Everything looks good!' : 'Ready to update signatures?'}
          </h2>
          <p className="mt-2 text-gray-500 max-w-md mx-auto">
            {isUpToDate
              ? 'All your team members have the latest signature. You can make changes anytime.'
              : `Apply your "${defaultTemplate.name}" signature to ${pendingCount > 0 ? pendingCount : activeCount} team member${(pendingCount > 0 ? pendingCount : activeCount) !== 1 ? 's' : ''}.`}
          </p>
          <div className="mt-6 flex justify-center gap-4">
            <Link href="/dashboard/signature" className="btn-secondary">
              Edit Signature
            </Link>
            {!isUpToDate && (
              <form action="/api/signatures/apply" method="POST">
                <button type="submit" className="btn-primary">
                  Apply to Everyone
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Getting started for new users */}
      {(!hasSignature || !hasTeam) && (
        <div className="card p-8">
          <h2 className="text-xl font-semibold text-gray-900 text-center">
            Get started in minutes
          </h2>
          <div className="mt-8 max-w-2xl mx-auto">
            <ol className="space-y-6">
              <li className="flex gap-4">
                <span
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    hasSignature
                      ? 'bg-green-100 text-green-700'
                      : 'bg-primary-100 text-primary-700'
                  }`}
                >
                  {hasSignature ? '✓' : '1'}
                </span>
                <div>
                  <h3 className="font-medium text-gray-900">
                    Design your company signature
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Create a professional email signature with your company branding.
                    Personal details like name and title are filled in automatically.
                  </p>
                  {!hasSignature && (
                    <Link
                      href="/dashboard/signature"
                      className="inline-block mt-2 text-sm text-primary-600 hover:text-primary-700"
                    >
                      Create signature →
                    </Link>
                  )}
                </div>
              </li>
              <li className="flex gap-4">
                <span
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    hasTeam
                      ? 'bg-green-100 text-green-700'
                      : hasSignature
                      ? 'bg-primary-100 text-primary-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {hasTeam ? '✓' : '2'}
                </span>
                <div>
                  <h3 className="font-medium text-gray-900">
                    Import your team
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    We'll pull in everyone from your company directory with their
                    names, titles, and contact info.
                  </p>
                  {hasSignature && !hasTeam && (
                    <Link
                      href="/dashboard/people"
                      className="inline-block mt-2 text-sm text-primary-600 hover:text-primary-700"
                    >
                      Import team →
                    </Link>
                  )}
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-500">
                  3
                </span>
                <div>
                  <h3 className="font-medium text-gray-900">Apply signatures</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    With one click, apply your signature to everyone's email.
                    Changes are instant.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* Recent activity */}
      {lastActivity && (
        <div className="card">
          <div className="p-6 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Recent Activity</h2>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-900">
                  Signatures applied to {lastActivity.successCount} people
                </p>
                <p className="text-sm text-gray-500">
                  {lastActivity.completedAt?.toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}{' '}
                  at{' '}
                  {lastActivity.completedAt?.toLocaleTimeString(undefined, {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <Link
                href="/dashboard/activity"
                className="text-sm text-primary-600 hover:text-primary-700"
              >
                View all →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
