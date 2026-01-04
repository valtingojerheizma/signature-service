import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import Link from 'next/link';

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  const tenantId = session?.user?.tenantId;

  const [tenant, billing] = await Promise.all([
    tenantId
      ? prisma.tenant.findUnique({
          where: { id: tenantId },
          include: { workspaceConnection: true },
        })
      : null,
    tenantId
      ? prisma.billingAccount.findUnique({
          where: { tenantId },
        })
      : null,
  ]);

  const trialDaysRemaining = billing?.trialEndsAt
    ? Math.max(
        0,
        Math.ceil(
          (billing.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
      )
    : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-gray-500">
          Manage your account and billing.
        </p>
      </div>

      {/* Account */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Account</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <div className="text-sm text-gray-500">Organization</div>
            <div className="font-medium text-gray-900">{tenant?.name || 'Not set'}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Domain</div>
            <div className="font-medium text-gray-900">{tenant?.domain}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Signed in as</div>
            <div className="font-medium text-gray-900">{session?.user?.email}</div>
          </div>
        </div>
      </div>

      {/* Connection */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Connection</h2>
        </div>
        <div className="p-6">
          {tenant?.workspaceConnection ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-green-600"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div>
                  <div className="font-medium text-gray-900">Connected</div>
                  <div className="text-sm text-gray-500">
                    {tenant.workspaceConnection.userCount} team members synced
                  </div>
                </div>
              </div>
              <Link href="/setup/reconnect" className="btn-secondary text-sm">
                Reconnect
              </Link>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                    />
                  </svg>
                </div>
                <div>
                  <div className="font-medium text-gray-900">Not connected</div>
                  <div className="text-sm text-gray-500">
                    Connect to import your team
                  </div>
                </div>
              </div>
              <Link href="/setup" className="btn-primary text-sm">
                Connect
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Billing */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Billing</h2>
        </div>
        <div className="p-6">
          {billing ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">
                    {billing.plan === 'TRIAL' ? 'Free Trial' : 'Pro Plan'}
                  </div>
                  {billing.plan === 'TRIAL' && trialDaysRemaining !== null && (
                    <div className="text-sm text-gray-500">
                      {trialDaysRemaining > 0
                        ? `${trialDaysRemaining} day${trialDaysRemaining !== 1 ? 's' : ''} remaining`
                        : 'Trial expired'}
                    </div>
                  )}
                  {billing.plan === 'PRO' && billing.currentPeriodEnd && (
                    <div className="text-sm text-gray-500">
                      Renews{' '}
                      {billing.currentPeriodEnd.toLocaleDateString(undefined, {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </div>
                  )}
                </div>
                {billing.plan === 'TRIAL' ? (
                  <Link href="/api/billing/checkout" className="btn-primary text-sm">
                    Upgrade to Pro
                  </Link>
                ) : (
                  <Link href="/api/billing/portal" className="btn-secondary text-sm">
                    Manage Billing
                  </Link>
                )}
              </div>

              {billing.plan === 'TRIAL' && (
                <div className="bg-primary-50 rounded-lg p-4">
                  <h3 className="font-medium text-primary-900">
                    Pro Plan - $5/user/month
                  </h3>
                  <ul className="mt-2 space-y-1 text-sm text-primary-800">
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Unlimited signature updates
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Daily automatic sync
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Priority support
                    </li>
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-500">
              Complete setup to view billing options.
            </p>
          )}
        </div>
      </div>

      {/* Danger zone */}
      <div className="card border-red-200">
        <div className="px-6 py-4 border-b border-red-200 bg-red-50">
          <h2 className="font-semibold text-red-900">Danger Zone</h2>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900">Delete account</div>
              <div className="text-sm text-gray-500">
                Permanently delete your account and all data
              </div>
            </div>
            <button className="btn-danger text-sm" disabled>
              Delete Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
