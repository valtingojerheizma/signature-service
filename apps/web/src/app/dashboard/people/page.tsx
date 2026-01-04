import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export default async function PeoplePage() {
  const session = await getServerSession(authOptions);
  const tenantId = session?.user?.tenantId;

  const [employees, connection] = await Promise.all([
    tenantId
      ? prisma.employee.findMany({
          where: { tenantId },
          orderBy: { fullName: 'asc' },
        })
      : [],
    tenantId
      ? prisma.workspaceConnection.findUnique({
          where: { tenantId },
        })
      : null,
  ]);

  const activeEmployees = employees.filter((e) => !e.suspended);
  const suspendedEmployees = employees.filter((e) => e.suspended);

  // Group by org unit for display
  const byOrgUnit = activeEmployees.reduce(
    (acc, emp) => {
      const org = emp.orgUnitPath || '/';
      if (!acc[org]) acc[org] = [];
      acc[org].push(emp);
      return acc;
    },
    {} as Record<string, typeof activeEmployees>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">People</h1>
          <p className="mt-1 text-gray-500">
            {employees.length > 0
              ? `${activeEmployees.length} team member${activeEmployees.length !== 1 ? 's' : ''} will receive your signature`
              : 'Import your team to get started'}
          </p>
        </div>
        {connection && (
          <form action="/api/people/refresh" method="POST">
            <button type="submit" className="btn-secondary">
              Refresh List
            </button>
          </form>
        )}
      </div>

      {connection?.lastSyncAt && (
        <div className="text-sm text-gray-500">
          Last refreshed:{' '}
          {connection.lastSyncAt.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </div>
      )}

      {employees.length === 0 ? (
        <div className="card p-12 text-center">
          <svg
            className="mx-auto w-16 h-16 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            Import your team
          </h3>
          <p className="mt-2 text-gray-500 max-w-sm mx-auto">
            Connect your company directory to import everyone's name, title, and
            contact info automatically.
          </p>
          <form action="/api/people/import" method="POST" className="mt-6">
            <button type="submit" className="btn-primary">
              Import from Google Workspace
            </button>
          </form>
        </div>
      ) : (
        <>
          {/* Active employees */}
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="font-medium text-gray-900">
                Active ({activeEmployees.length})
              </h2>
            </div>
            <div className="divide-y divide-gray-200">
              {activeEmployees.map((employee) => (
                <div key={employee.id} className="px-6 py-4">
                  <div className="flex items-center gap-4">
                    {employee.thumbnailUrl ? (
                      <img
                        src={employee.thumbnailUrl}
                        alt=""
                        className="w-10 h-10 rounded-full"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                        <span className="text-sm font-medium text-primary-700">
                          {employee.fullName.charAt(0)}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 truncate">
                          {employee.fullName}
                        </span>
                        {employee.lastDeployedAt && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">
                            Signature active
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 truncate">
                        {employee.title && <span>{employee.title}</span>}
                        {employee.title && employee.department && (
                          <span className="mx-1">·</span>
                        )}
                        {employee.department && <span>{employee.department}</span>}
                      </div>
                    </div>
                    <div className="text-sm text-gray-500 hidden sm:block">
                      {employee.primaryEmail}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Suspended employees */}
          {suspendedEmployees.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="font-medium text-gray-500">
                  Suspended ({suspendedEmployees.length})
                </h2>
                <p className="text-sm text-gray-400">
                  These accounts are suspended and won't receive signatures
                </p>
              </div>
              <div className="divide-y divide-gray-200">
                {suspendedEmployees.map((employee) => (
                  <div key={employee.id} className="px-6 py-4 opacity-50">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                        <span className="text-sm font-medium text-gray-500">
                          {employee.fullName.charAt(0)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-gray-600 truncate">
                          {employee.fullName}
                        </span>
                        <div className="text-sm text-gray-400">
                          {employee.primaryEmail}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
