import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export default async function EmployeesPage() {
  const session = await getServerSession(authOptions);
  const tenantId = session?.user?.tenantId;

  const employees = tenantId
    ? await prisma.employee.findMany({
        where: { tenantId },
        orderBy: { fullName: 'asc' },
      })
    : [];

  const connection = tenantId
    ? await prisma.workspaceConnection.findUnique({
        where: { tenantId },
      })
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage employees synced from Google Workspace Directory.
          </p>
        </div>
        <form action="/api/directory/sync" method="POST">
          <button type="submit" className="btn-primary">
            Sync Now
          </button>
        </form>
      </div>

      {connection?.lastSyncAt && (
        <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
          Last synced: {connection.lastSyncAt.toLocaleString()} ({connection.userCount}{' '}
          users)
          {connection.lastSyncStatus === 'FAILED' && (
            <span className="ml-2 text-red-600">
              Failed: {connection.lastSyncError}
            </span>
          )}
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Title
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Org Unit
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {employees.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  No employees synced yet. Click "Sync Now" to import from Google
                  Workspace.
                </td>
              </tr>
            ) : (
              employees.map((employee) => (
                <tr key={employee.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {employee.thumbnailUrl ? (
                        <img
                          src={employee.thumbnailUrl}
                          alt=""
                          className="w-8 h-8 rounded-full mr-3"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center mr-3">
                          <span className="text-sm font-medium text-primary-700">
                            {employee.fullName.charAt(0)}
                          </span>
                        </div>
                      )}
                      <span className="font-medium text-gray-900">
                        {employee.fullName}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {employee.primaryEmail}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {employee.title || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {employee.orgUnitPath}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        employee.suspended
                          ? 'bg-red-100 text-red-800'
                          : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {employee.suspended ? 'Suspended' : 'Active'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
