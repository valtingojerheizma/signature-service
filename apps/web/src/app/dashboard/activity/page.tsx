import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export default async function ActivityPage() {
  const session = await getServerSession(authOptions);
  const tenantId = session?.user?.tenantId;

  const activities = tenantId
    ? await prisma.auditLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          adminUser: {
            select: { name: true, email: true },
          },
        },
      })
    : [];

  // Also get deployment runs for a simpler view
  const deployments = tenantId
    ? await prisma.deploymentRun.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
    : [];

  const getActivityDescription = (action: string): string => {
    const descriptions: Record<string, string> = {
      TEMPLATE_CREATED: 'Created a new signature design',
      TEMPLATE_UPDATED: 'Updated the signature design',
      TEMPLATE_DELETED: 'Deleted a signature design',
      DIRECTORY_SYNCED: 'Refreshed the team list',
      DEPLOYMENT_STARTED: 'Started applying signatures',
      DEPLOYMENT_COMPLETED: 'Finished applying signatures',
      DEPLOYMENT_FAILED: 'Failed to apply some signatures',
      WORKSPACE_CONNECTED: 'Connected company directory',
      TENANT_CREATED: 'Set up the account',
      SUBSCRIPTION_CREATED: 'Started subscription',
      SUBSCRIPTION_UPDATED: 'Updated subscription',
    };
    return descriptions[action] || action.toLowerCase().replace(/_/g, ' ');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-green-100 text-green-700';
      case 'RUNNING':
        return 'bg-blue-100 text-blue-700';
      case 'FAILED':
        return 'bg-red-100 text-red-700';
      case 'PENDING':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'Complete';
      case 'RUNNING':
        return 'In progress';
      case 'FAILED':
        return 'Failed';
      case 'PENDING':
        return 'Pending';
      default:
        return status;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Activity</h1>
        <p className="mt-1 text-gray-500">
          Recent changes to your email signatures.
        </p>
      </div>

      {/* Recent signature updates */}
      {deployments.length > 0 && (
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Signature Updates</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {deployments.map((deployment) => (
              <div key={deployment.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${getStatusColor(
                          deployment.status
                        )}`}
                      >
                        {getStatusLabel(deployment.status)}
                      </span>
                      <span className="text-gray-900">
                        {deployment.status === 'COMPLETED'
                          ? `Applied to ${deployment.successCount} people`
                          : deployment.status === 'RUNNING'
                          ? `Applying to ${deployment.totalUsers} people...`
                          : deployment.status === 'FAILED'
                          ? `${deployment.failureCount} failed, ${deployment.successCount} succeeded`
                          : `Preparing for ${deployment.totalUsers} people`}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      {deployment.createdAt.toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  {deployment.status === 'FAILED' && deployment.failureCount > 0 && (
                    <form action={`/api/signatures/retry/${deployment.id}`} method="POST">
                      <button type="submit" className="btn-secondary text-sm">
                        Retry Failed
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All activity log */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">All Activity</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {activities.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
              No activity yet. Changes you make will appear here.
            </div>
          ) : (
            activities.map((activity) => (
              <div key={activity.id} className="px-6 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                      {activity.adminUser?.name ? (
                        <span className="text-sm font-medium text-gray-600">
                          {activity.adminUser.name.charAt(0)}
                        </span>
                      ) : (
                        <svg
                          className="w-4 h-4 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900">
                      {getActivityDescription(activity.action)}
                    </p>
                    <p className="text-sm text-gray-500">
                      {activity.adminUser?.name || 'System'} ·{' '}
                      {activity.createdAt.toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
